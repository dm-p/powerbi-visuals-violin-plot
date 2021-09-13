import 'core-js/stable';
import 'regenerator-runtime';
import './../style/visual.less';
import powerbi from 'powerbi-visuals-api';
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import VisualUpdateType = powerbi.VisualUpdateType;
import VisualDataChangeOperationKind = powerbi.VisualDataChangeOperationKind;
import ITooltipService = powerbi.extensibility.ITooltipService;
import { legend, legendInterfaces } from 'powerbi-visuals-utils-chartutils';
import createLegend = legend.createLegend;
import ILegend = legendInterfaces.ILegend;
import LegendPosition = legendInterfaces.LegendPosition;

import * as d3 from 'd3';

import { VisualSettings } from './settings';
import { VisualDebugger } from './visualDebugger';

import { ViewModelHandler } from './viewModelHandler';
import { ICategory, EComboPlotType } from './models';
import {
    renderViolin,
    renderBoxPlot,
    renderColumnPlot,
    renderLinePlot,
    visualUsage,
    dataLimitLoadingStatus,
    visualCollapsed
} from './visualHelpers';
import { ViolinLegend } from './violinLegend';
import { bindSeriesTooltipEvents, bindWarningTooltipEvents } from './tooltip';

export class Visual implements IVisual {
    private element: HTMLElement;
    private container: d3.Selection<{}>;
    private settings: VisualSettings;
    private options: VisualUpdateOptions;
    private colourPalette: ISandboxExtendedColorPalette;
    private defaultColour: string;
    private host: IVisualHost;
    private viewModelHandler: ViewModelHandler;
    private tooltipService: ITooltipService;
    private errorState: boolean;
    private legend: ILegend;
    private canFetchMore: boolean;
    private windowsLoaded: number;
    private locale: string;
    private events: IVisualEventService;

    /**
     * Instantiation of the visual
     * @param options
     */
    constructor(options: VisualConstructorOptions) {
        this.element = options.element;
        this.colourPalette = options.host.colorPalette;
        this.host = options.host;
        this.events = options.host.eventService;
        this.tooltipService = options.host.tooltipService;
        this.defaultColour = this.colourPalette['colors'][0].value;
        this.viewModelHandler = new ViewModelHandler();

        // Legend container
        this.legend = createLegend(
            options.element,
            false,
            null,
            false,
            LegendPosition.Top
        );

        // Visual container
        this.container = d3
            .select(options.element)
            .append('div')
            .classed('violinPlotContainer', true);
    }

    /**
     * Visual update event handling
     * @param options
     */
    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        this.options = options;
        this.settings = Visual.parseSettings(
            options && options.dataViews && options.dataViews[0]
        );
        this.errorState = false;
        this.viewModelHandler.clearProfiling();
        this.viewModelHandler.settings = this.settings;
        this.viewModelHandler.viewport = options.viewport;

        // Initial debugging for visual update
        this.viewModelHandler.debug =
            this.settings.about.debugMode &&
            this.settings.about.debugVisualUpdate;
        let debug = new VisualDebugger(
            this.settings.about.debugMode &&
                this.settings.about.debugVisualUpdate
        );
        debug.clear();
        debug.heading('Visual Update');
        debug.log(`Update type: ${options.type}`);
        debug.profileStart();
        debug.log('Settings', this.settings);
        debug.log('Viewport (Pre-legend)', options.viewport);
        debug.log('Locale', this.locale);

        /** This is a bit hacky, but I wanted to populate the default colour in parseSettings. I could manage it for the properties pane
         *  (and that code remains in-place below) but not in the settings object, so this "coerces" it based on the palette's first
         *  assigned colour.
         */
        if (!this.settings.dataColours.defaultFillColour) {
            this.settings.dataColours.defaultFillColour = this.defaultColour;
        }

        // Clear down existing plot
        this.container.selectAll('*').remove();

        /**
         *  Size our initial container to match the viewport
         *  We could potentially compare this on resize and do the appropriate calculations to minimise rework
         */
        this.container.attr({
            width: `${options.viewport.width}`,
            height: `${options.viewport.height}`
        });

        // Things that can terminate the update process early

        // Validation of inputs and display a nice message
        if (
            !options.dataViews ||
            !options.dataViews[0] ||
            !options.dataViews[0].metadata ||
            !options.dataViews[0].metadata.columns.filter(
                c => c.roles['sampling']
            )[0] ||
            !options.dataViews[0].categorical.values
        ) {
            this.errorState = true;
            this.renderLegend();
            visualUsage(this.container, this.host, this.settings);
            this.events.renderingFinished(options);
            if (debug) {
                debug.log('Update cancelled due to incomplete fields.');
                debug.footer();
            }
            return;
        }

        /**
         *  Look for more data and load it if we can. This will trigger a subsequent update so we need to try and avoid re-rendering
         *  while we're fetching more data.
         *
         *  For people viewing the source code, this option is hard-switched off in the settings, as I have observed some issues when
         *  using categories and individual data colours (the property pane breaks), as well as resizing the visual (sometimes it just
         *  doesn't trigger the update correctly, which is likely causing an exception somewhere in the render code). The 1.x API has
         *  memory leak issues, which don't help with diagnosis. The fecthMoreData() function is also broken in v2.1 and v2.2 of the custom
         *  visuals API in different ways, so I'm hoping to revist later on. The code is here for posterity in the hope that I can just
         *  switch it on once I find a suitable API version.
         */
        if (this.settings.dataLimit.enabled) {
            if (
                options.operationKind === VisualDataChangeOperationKind.Create
            ) {
                this.canFetchMore = true;
                this.windowsLoaded = 1;
            } else {
                this.windowsLoaded++;
            }

            let rowCount =
                options.dataViews[0].categorical.values[0].values.length;

            if (
                options.dataViews[0].metadata.segment &&
                this.settings.dataLimit.override &&
                this.canFetchMore
            ) {
                debug.log(
                    'Not all data loaded. Loading more (if we can...)...'
                );
                debug.log(`We have loaded ${this.windowsLoaded} times so far.`);

                // Handle rendering of 'help text', if enabled
                if (this.settings.dataLimit.showInfo) {
                    dataLimitLoadingStatus(
                        rowCount,
                        this.container,
                        this.settings
                    );
                }
                this.canFetchMore = this.host.fetchMoreData();
                // Clear down existing info and render if we have no more allocated memory
                if (!this.canFetchMore) {
                    debug.log(
                        `Memory limit hit after ${this.windowsLoaded} fetch(es). We managed to get ${rowCount} rows.`
                    );
                    this.container.selectAll('*').remove();
                    this.renderVisual(options, debug);
                }
            } else {
                debug.log('We have all the data we can get!');
                this.renderVisual(options, debug);
            }
        } else {
            debug.log(
                'Data limit options disabled. Skipping over and rendering visual.'
            );
            this.renderVisual(options, debug);
        }
    }

    /**
     * Decoupling of the chart rendering, just in case we needed to load more data above (which will fire the `update()` method again and
     * it makes no sense to actually render the visual if we're going back to the well...)
     *
     * @param options
     * @param debug
     */
    private renderVisual(options, debug) {
        /** #44: When the visual updates, we don't always need to re-map the view model data, as we already have it.
         *  We only want to do the things that depend on data change vents and de-couple the rest so they fire on the events that don't require it
         */
        switch (options.type) {
            case VisualUpdateType.Data:
            case VisualUpdateType.All: {
                debug.footer();

                this.viewModelHandler.mapDataView(
                    options,
                    this.host,
                    this.colourPalette
                );
                this.viewModelHandler.calculateStatistics();
                this.viewModelHandler.sortAndFilterData();
                this.renderLegend();
                this.viewModelHandler.initialiseAxes(options);
                break;
            }
            default: {
                debug.log('No need to re-map data. Skipping over...');
                this.renderLegend();
            }
        }

        debug.log('Viewport (Post-legend)', this.viewModelHandler.viewport);
        debug.log('Data View', options.dataViews[0]);

        // Map the rest of the view model
        this.viewModelHandler.processAxisText();
        this.viewModelHandler.doKde(options);
        let viewModel = this.viewModelHandler.viewModel;
        debug.log('View model', viewModel);

        // We may not have any room for anything after we've done our responsiveness chacks, so let's display an indicator
        if (viewModel.yAxis.collapsed || viewModel.xAxis.collapsed) {
            visualCollapsed(this.container);
            debug.log('Visual fully collapsed due to viewport size!');
        } else {
            // Add our main SVG
            debug.log('Plotting SVG canvas...');
            let violinPlotCanvas = this.container
                .append('svg')
                .classed('violinPlotCanvas', true)
                .attr({
                    width: `${options.viewport.width}`,
                    height: `${options.viewport.height}`
                });

            // Watermark for non-production use, if the dev flag is set
            if (
                this.settings.about.development ||
                this.settings.about.version.indexOf('DEV') !== -1
            ) {
                let fontSize = 12;
                violinPlotCanvas
                    .append('text')
                    .attr({
                        transform: `translate(${this.viewModelHandler.viewport
                            .width / 2}, ${fontSize * 2})`,
                        'text-anchor': 'middle',
                        opacity: 0.5
                    })
                    .style({
                        'font-weight': 'bold',
                        fill: 'red',
                        'font-size': `${fontSize}px`
                    })
                    .append('tspan')
                    .text(
                        `${this.settings.about.visualName.toUpperCase()} ${
                            this.settings.about.version
                        } - NOT FOR PRODUCTION USE`
                    )
                    .attr({
                        x: 0,
                        dy: '-1em'
                    });
            }

            // Handle category reduction, if applied
            if (viewModel.categoriesReduced) {
                debug.log('Plotting warning icon and interactivity...');
                let warningElement = violinPlotCanvas
                    .append('g')
                    .classed('condensedWarning', true)
                    .attr({
                        transform: `translate(${this.viewModelHandler.viewport
                            .width - 20}, ${20})`,
                        opacity: '0.6'
                    })
                    .append('text')
                    .html('&#9888;')
                    .style('display', 'none');

                /** Add mouse events to show/hide warning on mouseover (we don't want it showing all the time,
                 *  but we should inform the user what's going on as this is not part of the dataReductionAlgorithm
                 *  stuff)
                 */
                violinPlotCanvas.on('mouseover', () => {
                    warningElement.style('display', null);
                });
                violinPlotCanvas.on('mouseout', () => {
                    warningElement.style('display', 'none');
                });
            }

            // Create a Y axis
            if (this.settings.yAxis.show) {
                debug.log('Plotting y-axis...');
                let yAxisContainer = violinPlotCanvas
                    .append('g')
                    .classed('yAxisContainer', true)
                    .style({
                        'font-size':
                            viewModel.yAxis.labelTextProperties.fontSize,
                        'font-family': this.settings.yAxis.fontFamily,
                        fill: this.settings.yAxis.fontColor
                    });

                // Add title if required
                if (
                    this.settings.yAxis.showTitle &&
                    viewModel.yAxis.titleDisplayName &&
                    viewModel.yAxis.titleDimensions.width > 0
                ) {
                    debug.log('Plotting y-axis title...');
                    yAxisContainer
                        .append('text')
                        .classed('yAxisTitle', true)
                        .attr({
                            transform: 'rotate(-90)',
                            x: viewModel.yAxis.titleDimensions.x,
                            y: viewModel.yAxis.titleDimensions.y,
                            dy: '1em'
                        })
                        .style({
                            'text-anchor': 'middle',
                            'font-size':
                                viewModel.yAxis.titleDisplayName.textProperties
                                    .fontSize,
                            'font-family': this.settings.yAxis.titleFontFamily,
                            fill: this.settings.yAxis.titleColor
                        })
                        .text(viewModel.yAxis.titleDisplayName.tailoredName);
                }

                debug.log('Plotting y-axis ticks...');
                let yAxisTicks = yAxisContainer
                    .append('g')
                    .classed({
                        yAxis: true,
                        grid: true
                    })
                    .attr(
                        'transform',
                        `translate(${viewModel.yAxis.dimensions.width}, 0)`
                    )
                    .call(viewModel.yAxis.generator);

                // Apply gridline styling
                debug.log('Applying y-axis gridline styling...');
                yAxisTicks
                    .selectAll('line')
                    .attr({
                        stroke: this.settings.yAxis.gridlineColor,
                        'stroke-width': this.settings.yAxis.gridlines
                            ? this.settings.yAxis.gridlineStrokeWidth
                            : 0
                    })
                    .classed(this.settings.yAxis.gridlineStrokeLineStyle, true);
            }

            // Create an X-axis
            if (this.settings.xAxis.show) {
                debug.log('Plotting x-axis...');
                let xAxisContainer = violinPlotCanvas
                    .append('g')
                    .classed('xAxisContainer', true)
                    .style({
                        'font-size':
                            viewModel.xAxis.labelTextProperties.fontSize,
                        'font-family': this.settings.xAxis.fontFamily,
                        fill: this.settings.xAxis.fontColor
                    });

                debug.log('Plotting x-axis ticks...');
                let xAxisTicks = xAxisContainer
                    .append('g')
                    .classed({
                        xAxis: true,
                        grid: true
                    })
                    .attr(
                        'transform',
                        `translate(${
                            viewModel.yAxis.dimensions.width
                        }, ${options.viewport.height -
                            viewModel.xAxis.dimensions.height})`
                    )
                    .call(viewModel.xAxis.generator);

                // Apply gridline styling
                debug.log('Applying x-axis gridline styling...');
                xAxisTicks
                    .selectAll('line')
                    .attr({
                        stroke: this.settings.xAxis.gridlineColor,
                        'stroke-width': this.settings.xAxis.gridlines
                            ? this.settings.xAxis.gridlineStrokeWidth
                            : 0
                    })
                    .classed(this.settings.xAxis.gridlineStrokeLineStyle, true);

                // Add title if required
                if (
                    this.settings.xAxis.showTitle &&
                    viewModel.xAxis.titleDisplayName &&
                    viewModel.xAxis.titleDimensions.height > 0
                ) {
                    debug.log('Plotting x-axis title...');
                    xAxisContainer
                        .append('text')
                        .classed('xAxisTitle', true)
                        .attr({
                            x: viewModel.xAxis.titleDimensions.x,
                            y: viewModel.xAxis.titleDimensions.y,
                            dy: '1em'
                        })
                        .style({
                            'text-anchor': 'middle',
                            'font-size':
                                viewModel.xAxis.titleDisplayName.textProperties
                                    .fontSize,
                            'font-family': this.settings.xAxis.titleFontFamily,
                            fill: this.settings.xAxis.titleColor
                        })
                        .text(viewModel.xAxis.titleDisplayName.tailoredName);
                }
            }

            // Do the rest, if required

            // Add series elements
            debug.log('Plotting category elements...');
            let seriesContainer = violinPlotCanvas
                .selectAll('.violinPlotCanvas')
                .data(viewModel.categories)
                .enter()
                .append('g')
                .classed({
                    violinPlotSeries: true
                })
                .attr({
                    transform: d =>
                        `translate(${viewModel.xAxis.scale(d.name) +
                            viewModel.yAxis.dimensions.width}, 0)`,
                    width: viewModel.xAxis.scale.rangeBand()
                });

            // Tooltips
            debug.log('Adding tooltip events...');
            const series: d3.Selection<ICategory> = violinPlotCanvas.selectAll(
                '.violinPlotSeries'
            );
            bindSeriesTooltipEvents(
                series,
                this.tooltipService,
                this.settings,
                viewModel
            );
            const warningElem = violinPlotCanvas.select('.condensedWarning');
            bindWarningTooltipEvents(
                warningElem,
                this.tooltipService,
                this.settings
            );

            // KDE plot
            debug.log('Rendering violins...');
            renderViolin(seriesContainer, viewModel, this.settings);

            // Combo plot
            if (this.settings.dataPoints.show) {
                switch (this.settings.dataPoints.plotType) {
                    case 'boxPlot': {
                        debug.log('Rendering box plots...');
                        renderBoxPlot(
                            seriesContainer,
                            viewModel,
                            this.settings
                        );
                        break;
                    }

                    case 'barcodePlot': {
                        debug.log('Rendering barcode plots...');
                        renderLinePlot(
                            seriesContainer,
                            viewModel,
                            this.settings,
                            EComboPlotType.barcodePlot
                        );
                        break;
                    }

                    case 'columnPlot': {
                        debug.log('Rendering column plots...');
                        renderColumnPlot(
                            seriesContainer,
                            viewModel,
                            this.settings
                        );
                        break;
                    }
                }
            }
        }

        // Success!
        debug.log('Visual fully rendered!');
        viewModel.profiling.categories.push(debug.getSummary('Total'));
        debug.footer();
        this.events.renderingFinished(options);
    }

    /**
     * Renders the legend, based on the properties supplied in the update method
     */
    private renderLegend(): void {
        let debug = new VisualDebugger(
            this.settings.about.debugMode &&
                this.settings.about.debugVisualUpdate
        );
        debug.log('Starting renderLegend');
        debug.log('Checking legend position...');
        debug.profileStart();

        let violinLegend = new ViolinLegend(
            this.errorState,
            this.container,
            this.legend,
            this.viewModelHandler.viewport,
            this.viewModelHandler.viewModel,
            this.settings,
            this.host
        );
        violinLegend.renderLegend();
        this.legend = violinLegend.legend;
        this.viewModelHandler.viewport = {
            width: violinLegend.newViewport.width,
            height: violinLegend.newViewport.height
        };
        debug.log('Adjusted viewport:', this.viewModelHandler.viewport);
        this.viewModelHandler.viewModel.profiling.categories.push(
            debug.getSummary('Legend')
        );
        debug.footer();
    }

    /**
     * Parses and gets the visual settings
     * @param dataView
     */
    private static parseSettings(dataView: DataView): VisualSettings {
        return <VisualSettings>VisualSettings.parse(dataView);
    }

    /**
     * This function gets called for each of the objects defined in the `capabilities.json` file and allows you to select which of the
     * objects and properties you want to expose to the users in the property pane.
     */
    public enumerateObjectInstances(
        options: EnumerateVisualObjectInstancesOptions
    ): VisualObjectInstance[] {
        const instances: VisualObjectInstance[] = (<
            VisualObjectInstanceEnumerationObject
        >VisualSettings.enumerateObjectInstances(
            this.settings || VisualSettings.getDefault(),
            options
        )).instances;
        let objectName = options.objectName;
        let categories: boolean = this.options.dataViews[0].metadata.columns.filter(
            c => c.roles['category']
        )[0]
            ? true
            : false;

        // Initial debugging for properties update
        let debug = new VisualDebugger(
            this.settings.about.debugMode && this.settings.about.debugProperties
        );
        debug.heading(`Properties: ${objectName}`);

        // Apply instance-specific transformations
        switch (objectName) {
            /**
             *  The data limit options were intended to be enabled in conditions where we could fetch more data from the model, but there have been
             *  some issues in getting this to work reliably, so for now they are turned off. Refer to notes above in `update()` for more details as
             *  to why. As the code represents a fair bit of work to get the implementation going, we'll enable it based on the `enabled` property
             *  in the `dataLimitSettings` class, once we can get this to work reliably. For now this is left for anyone interested in the source code,
             *  to see where I got to with it as a feature.
             */
            case 'dataLimit': {
                // If not overriding then we don't need to show the additional info options
                if (!this.settings.dataLimit.override) {
                    delete instances[0].properties['showInfo'];
                    delete instances[0].properties['showCustomVisualNotes'];
                }
                // Developer notes won't be an option if we hide the loading progress
                if (!this.settings.dataLimit.showInfo) {
                    delete instances[0].properties['showCustomVisualNotes'];
                }
                // If we have less than 30K rows in our data set then we don't need to show it
                if (
                    !this.settings.dataLimit.enabled ||
                    (!this.options.dataViews[0].metadata.segment &&
                        this.options.dataViews[0].categorical.values &&
                        this.options.dataViews[0].categorical.values[0].values
                            .length <= 30000)
                ) {
                    instances[0] = null;
                    // Set back to capability window cap if removed
                    this.settings.dataLimit.override = false;
                }
                break;
            }
            case 'about': {
                // Version should always show the default
                instances[0].properties[
                    'version'
                ] = VisualSettings.getDefault()['about'].version;
                // Switch off and hide debug mode if development flag is disabled
                if (!this.settings.about.development) {
                    delete instances[0].properties['debugMode'];
                    delete instances[0].properties['debugVisualUpdate'];
                    delete instances[0].properties['debugTooltipEvents'];
                    delete instances[0].properties['debugProperties'];
                }
                // Reset the individual flags if debug mode switched off
                if (!this.settings.about.debugMode) {
                    this.settings.about.debugVisualUpdate = false;
                    this.settings.about.debugTooltipEvents = false;
                    this.settings.about.debugProperties = false;
                    delete instances[0].properties['debugVisualUpdate'];
                    delete instances[0].properties['debugTooltipEvents'];
                    delete instances[0].properties['debugProperties'];
                }
                break;
            }
            case 'violin': {
                // Range validation on stroke width
                instances[0].validValues = instances[0].validValues || {};
                instances[0].validValues.strokeWidth = {
                    numberRange: {
                        min: 0,
                        max: 5
                    }
                };
                // Range validation on inner padding (0% - 50%)
                instances[0].validValues.innerPadding = {
                    numberRange: {
                        min: 0,
                        max: 50
                    }
                };
                // Enable options for different violin types (currently only line)
                if (this.settings.violin.type !== 'line') {
                    delete instances[0].properties['strokeWidth'];
                    delete instances[0].properties['clamp'];
                    delete instances[0].properties['resolution'];
                    delete instances[0].properties['kernel'];
                    delete instances[0].properties['specifyBandwidth'];
                }

                // If there are no categories, don't offer the option to calculate bandwidth for them
                if (!categories) {
                    delete instances[0].properties['bandwidthByCategory'];
                    this.settings.violin.bandwidthByCategory = false;
                }

                // Manual bandwidth toggle
                if (!this.settings.violin.specifyBandwidth) {
                    delete instances[0].properties['bandwidth'];
                }

                // Add categories if we want to specify individual bandwidth
                if (
                    this.settings.violin.bandwidthByCategory &&
                    categories &&
                    this.settings.violin.specifyBandwidth &&
                    !this.errorState
                ) {
                    for (let category of this.viewModelHandler.viewModel
                        .categories) {
                        if (!category) {
                            continue;
                        }
                        instances.push({
                            objectName: objectName,
                            displayName: category.displayName.formattedName,
                            properties: {
                                categoryBandwidth:
                                    category.statistics.bandwidthActual
                            },
                            selector: category.selectionId.getSelector()
                        });
                    }
                }

                break;
            }
            case 'dataPoints': {
                // Range validation on stroke width
                instances[0].validValues = instances[0].validValues || {};
                instances[0].validValues.strokeWidth = instances[0].validValues.medianStrokeWidth = instances[0].validValues.meanStrokeWidth = instances[0].validValues.quartile1StrokeWidth = instances[0].validValues.quartile3StrokeWidth = {
                    numberRange: {
                        min: 1,
                        max: 5
                    }
                };
                // Range validation on box plot width
                instances[0].validValues.innerPadding = {
                    numberRange: {
                        min: 0,
                        max: 90
                    }
                };

                // Toggle median
                if (!this.settings.dataPoints.showMedian) {
                    delete instances[0].properties['medianFillColour'];
                    delete instances[0].properties['medianStrokeWidth'];
                    delete instances[0].properties['medianStrokeLineStyle'];
                }

                // Combo plot-specific behaviour
                switch (this.settings.dataPoints.plotType) {
                    case 'boxPlot': {
                        // Remove non-box plot properties
                        delete instances[0].properties['barColour'];
                        delete instances[0].properties['showQuartiles'];
                        delete instances[0].properties['quartile1FillColour'];
                        delete instances[0].properties['quartile1StrokeWidth'];
                        delete instances[0].properties[
                            'quartile1StrokeLineStyle'
                        ];
                        delete instances[0].properties['quartile3FillColour'];
                        delete instances[0].properties['quartile3StrokeWidth'];
                        delete instances[0].properties[
                            'quartile3StrokeLineStyle'
                        ];

                        // Toggle mean
                        if (!this.settings.dataPoints.showMean) {
                            delete instances[0].properties['meanFillColour'];
                            delete instances[0].properties['meanStrokeWidth'];
                            delete instances[0].properties[
                                'meanFillColourInner'
                            ];
                        }

                        break;
                    }

                    case 'barcodePlot': {
                        // Remove non-barcode plot properties
                        delete instances[0].properties['transparency'];
                        delete instances[0].properties['boxFillColour'];
                        delete instances[0].properties['showWhiskers'];
                        delete instances[0].properties['showMean'];
                        delete instances[0].properties['meanFillColour'];
                        delete instances[0].properties['meanStrokeWidth'];
                        delete instances[0].properties['meanFillColourInner'];

                        // Toggle quartile properties
                        if (!this.settings.dataPoints.showQuartiles) {
                            delete instances[0].properties[
                                'quartile1FillColour'
                            ];
                            delete instances[0].properties[
                                'quartile1StrokeWidth'
                            ];
                            delete instances[0].properties[
                                'quartile1StrokeLineStyle'
                            ];
                            delete instances[0].properties[
                                'quartile3FillColour'
                            ];
                            delete instances[0].properties[
                                'quartile3StrokeWidth'
                            ];
                            delete instances[0].properties[
                                'quartile3StrokeLineStyle'
                            ];
                        }

                        break;
                    }

                    case 'columnPlot': {
                        // Remove non-column plot properties
                        delete instances[0].properties['showWhiskers'];
                        delete instances[0].properties['barColour'];

                        // Toggle quartile properties
                        if (!this.settings.dataPoints.showQuartiles) {
                            delete instances[0].properties[
                                'quartile1FillColour'
                            ];
                            delete instances[0].properties[
                                'quartile1StrokeWidth'
                            ];
                            delete instances[0].properties[
                                'quartile1StrokeLineStyle'
                            ];
                            delete instances[0].properties[
                                'quartile3FillColour'
                            ];
                            delete instances[0].properties[
                                'quartile3StrokeWidth'
                            ];
                            delete instances[0].properties[
                                'quartile3StrokeLineStyle'
                            ];
                        }

                        // Toggle mean
                        if (!this.settings.dataPoints.showMean) {
                            delete instances[0].properties['meanFillColour'];
                            delete instances[0].properties['meanStrokeWidth'];
                            delete instances[0].properties[
                                'meanFillColourInner'
                            ];
                        }
                    }
                }

                break;
            }
            case 'sorting': {
                // Disable/hide if not using categories
                if (
                    !this.options.dataViews[0].metadata.columns.filter(
                        c => c.roles['category']
                    )[0]
                ) {
                    instances[0] = null;
                }
                break;
            }
            case 'tooltip': {
                // Range validation on precision fields
                instances[0].validValues = instances[0].validValues || {};
                instances[0].validValues.numberSamplesPrecision = instances[0].validValues.measurePrecision = {
                    numberRange: {
                        min: 0,
                        max: 10
                    }
                };
                break;
            }
            case 'dataColours': {
                // Assign default theme colour from palette if default fill colour not overridden
                if (!this.settings.dataColours.defaultFillColour) {
                    instances[0].properties[
                        'defaultFillColour'
                    ] = this.defaultColour;
                }
                // If there are no categories, don't offer the option to colour by them
                if (
                    !this.options.dataViews[0].metadata.columns.filter(
                        c => c.roles['category']
                    )[0]
                ) {
                    delete instances[0].properties['colourByCategory'];
                    this.settings.dataColours.colourByCategory = false; // This prevents us losing the default fill if we remove the field afterward
                }
                // Add categories if we want to colour by them
                if (
                    this.settings.dataColours.colourByCategory &&
                    !this.errorState
                ) {
                    delete instances[0].properties['defaultFillColour'];
                    for (let category of this.viewModelHandler.viewModel
                        .categories) {
                        if (!category) {
                            continue;
                        }
                        instances.push({
                            objectName: objectName,
                            displayName: category.displayName.formattedName,
                            properties: {
                                categoryFillColour: {
                                    solid: {
                                        color: category.colour
                                    }
                                }
                            },
                            selector: category.selectionId.getSelector()
                        });
                    }
                }
                break;
            }
            case 'legend': {
                // Legend title toggle
                if (
                    !this.settings.legend.show &&
                    !this.settings.legend.showTitle
                ) {
                    delete instances[0].properties['titleText'];
                }
                // Statistical indicator handling
                if (!this.settings.legend.showStatisticalPoints) {
                    delete instances[0].properties['medianText'];
                    delete instances[0].properties['dataPointText'];
                    delete instances[0].properties['quartileCombinedText'];
                    delete instances[0].properties['quartile1Text'];
                    delete instances[0].properties['quartile3Text'];
                    delete instances[0].properties['meanText'];
                }

                // Hide combo plot-specific items
                if (this.settings.dataPoints.plotType === 'boxPlot') {
                    delete instances[0].properties['dataPointText'];
                    delete instances[0].properties['quartileCombinedText'];
                    delete instances[0].properties['quartile1Text'];
                    delete instances[0].properties['quartile3Text'];
                }
                if (this.settings.dataPoints.plotType === 'barcodePlot') {
                    delete instances[0].properties['meanText'];
                }
                if (this.settings.dataPoints.plotType === 'columnPlot') {
                    delete instances[0].properties['dataPointText'];
                }
                // Reset legend measure value items to default if blanked out
                if (!this.settings.legend.medianText) {
                    instances[0].properties[
                        'medianText'
                    ] = VisualSettings.getDefault()['legend'].medianText;
                }
                if (!this.settings.legend.meanText) {
                    instances[0].properties[
                        'meanText'
                    ] = VisualSettings.getDefault()['legend'].meanText;
                }
                if (!this.settings.legend.dataPointText) {
                    instances[0].properties[
                        'dataPointText'
                    ] = VisualSettings.getDefault()['legend'].dataPointText;
                }
                if (!this.settings.legend.quartileCombinedText) {
                    instances[0].properties[
                        'quartileCombinedText'
                    ] = VisualSettings.getDefault()[
                        'legend'
                    ].quartileCombinedText;
                }
                if (!this.settings.legend.quartile1Text) {
                    instances[0].properties[
                        'quartile1Text'
                    ] = VisualSettings.getDefault()['legend'].quartile1Text;
                }
                if (!this.settings.legend.quartile3Text) {
                    instances[0].properties[
                        'quartile3Text'
                    ] = VisualSettings.getDefault()['legend'].quartile3Text;
                }
                break;
            }
            case 'xAxis': {
                // Label toggle
                if (!this.settings.xAxis.showLabels) {
                    delete instances[0].properties['fontColor'];
                    delete instances[0].properties['fontSize'];
                    delete instances[0].properties['fontFamily'];
                }
                // Gridline toggle
                if (!this.settings.xAxis.gridlines) {
                    delete instances[0].properties['gridlineColor'];
                    delete instances[0].properties['gridlineStrokeWidth'];
                    delete instances[0].properties['gridlineStrokeLineStyle'];
                }
                //Title toggle
                if (!this.settings.xAxis.showTitle) {
                    delete instances[0].properties['titleColor'];
                    delete instances[0].properties['titleText'];
                    delete instances[0].properties['titleFontSize'];
                    delete instances[0].properties['titleFontFamily'];
                }
                // Range validation on grid line stroke width
                instances[0].validValues = instances[0].validValues || {};
                instances[0].validValues.gridlineStrokeWidth = {
                    numberRange: {
                        min: 1,
                        max: 5
                    }
                };
                break;
            }
            case 'yAxis': {
                // Label toggle
                if (!this.settings.yAxis.showLabels) {
                    delete instances[0].properties['fontColor'];
                    delete instances[0].properties['fontSize'];
                    delete instances[0].properties['fontFamily'];
                    delete instances[0].properties['labelDisplayUnits'];
                    delete instances[0].properties['precision'];
                }
                // Gridline toggle
                if (!this.settings.yAxis.gridlines) {
                    delete instances[0].properties['gridlineColor'];
                    delete instances[0].properties['gridlineStrokeWidth'];
                    delete instances[0].properties['gridlineStrokeLineStyle'];
                }
                // Title toggle
                if (!this.settings.yAxis.showTitle) {
                    delete instances[0].properties['titleStyle'];
                    delete instances[0].properties['titleColor'];
                    delete instances[0].properties['titleText'];
                    delete instances[0].properties['titleFontSize'];
                    delete instances[0].properties['titleFontFamily'];
                }
                // Title style toggle if units are none
                if (this.settings.yAxis.labelDisplayUnits === 1) {
                    instances[0].properties['titleStyle'] = 'title';
                }
                // Range validation on grid line stroke width and precision
                instances[0].validValues = instances[0].validValues || {};
                instances[0].validValues.precision = {
                    numberRange: {
                        min: 0,
                        max: 10
                    }
                };
                instances[0].validValues.gridlineStrokeWidth = {
                    numberRange: {
                        min: 1,
                        max: 5
                    }
                };
                // Range validation on start and end values. note that in ES5 we don't have Number.MAX/MIN_SAFE_INTEGER, so we define our own
                let safeMin = -9007199254740991,
                    safeMax = 9007199254740991;
                instances[0].validValues.start = {
                    numberRange: {
                        min: safeMin,
                        max:
                            this.settings.yAxis.end === 0
                                ? 0
                                : this.settings.yAxis.end || safeMax
                    }
                };
                instances[0].validValues.end = {
                    numberRange: {
                        min:
                            this.settings.yAxis.start === 0
                                ? 0
                                : this.settings.yAxis.start || safeMin,
                        max: safeMax
                    }
                };
                break;
            }
        }

        // Output all transformed instance info if we're debugging
        instances.map(instance => {
            debug.log(instance.objectName, instance);
        });
        debug.log('Properties fully processed!');
        debug.footer();

        return instances;
    }
}
