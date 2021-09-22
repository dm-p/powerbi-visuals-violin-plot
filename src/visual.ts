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
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import { legend, legendInterfaces } from 'powerbi-visuals-utils-chartutils';
import createLegend = legend.createLegend;
import ILegend = legendInterfaces.ILegend;
import LegendPosition = legendInterfaces.LegendPosition;

import * as d3 from 'd3';

import { VisualSettings, windowRows } from './settings';
import { VisualDebugger } from './visualDebugger';

import { ViewModelHandler } from './viewModelHandler';
import { renderViolin, visualUsage, dataLimitLoadingStatus, visualCollapsed } from './visualHelpers';
import {
    plotCanvas,
    plotSeriesContainer,
    plotWatermark,
    plotXAxis,
    plotYAxis,
    renderComboPlot,
    resolveContextMenu,
    sizeMainContainer
} from './dom';
import { ViolinLegend } from './violinLegend';
import { bindSeriesTooltipEvents } from './tooltip';
import { dataViewBreaksLimit, displayWindowCapWarning, getFormattedRowCount, i18nValue } from './utils';

export class Visual implements IVisual {
    private element: HTMLElement;
    private container: d3.Selection<{}>;
    private settings: VisualSettings;
    private options: VisualUpdateOptions;
    private colourPalette: ISandboxExtendedColorPalette;
    private defaultColour: string;
    private host: IVisualHost;
    private i18n: ILocalizationManager;
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
        this.i18n = this.host.createLocalizationManager();
        this.locale = this.host.locale;
        // Legend container
        this.legend = createLegend(options.element, false, null, false, LegendPosition.Top);
        // Visual container
        this.container = d3
            .select(options.element)
            .append('div')
            .classed('violinPlotContainer', true);
        // Context menu
        resolveContextMenu(this.container, this.host.createSelectionManager());
    }

    /**
     * Visual update event handling
     * @param options
     */
    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        this.options = options;
        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        this.errorState = false;
        this.viewModelHandler.clearProfiling();
        this.viewModelHandler.settings = this.settings;
        this.viewModelHandler.viewport = options.viewport;

        // Initial debugging for visual update
        const { about } = this.settings;
        this.viewModelHandler.debug = about.debugMode && about.debugVisualUpdate;
        const debug = new VisualDebugger(this.viewModelHandler.debug);
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
        sizeMainContainer(this.container, options.viewport);

        // Validation of inputs and display a nice message
        if (this.dataViewIsValid(options)) {
            this.errorState = true;
            this.renderLegend();
            visualUsage(this.container, this.host, this.settings);
            this.events.renderingFinished(options);
            debug.log('Update cancelled due to incomplete fields.');
            debug.footer();
            return;
        }
        this.handleDataFetch(options);
    }

    /**
     *  Look for more data and load it if we can. This will trigger a subsequent update so we need to try and avoid re-rendering
     *  while we're fetching more data.
     */
    private handleDataFetch(options: VisualUpdateOptions) {
        const debug = new VisualDebugger(this.viewModelHandler.debug),
            dataView = options.dataViews[0],
            rowCount = dataView.categorical.values[0].values.length,
            metadata = dataView.metadata,
            { dataLimit } = this.settings;
        if (this.settings.dataLimit.enabled) {
            this.updateFetchWindowDetails(options);
            const breaksDataLimit = dataViewBreaksLimit(metadata),
                fetchWindowHit = dataLimit.fetchWindowCap && this.windowsLoaded === dataLimit.fetchWindowLimit,
                fetchWindowCapValid = !fetchWindowHit || !dataLimit.fetchWindowCap,
                eligibleForFetch = metadata.segment && dataLimit.override && this.canFetchMore && fetchWindowCapValid,
                expectedRowCount = this.windowsLoaded * windowRows;
            debug.log('Windows loaded', this.windowsLoaded, 'Window hit', fetchWindowHit);
            if (eligibleForFetch) {
                debug.log(`Not all data loaded. Loading more (if we can). Loaded ${this.windowsLoaded} times so far.`);

                // Handle rendering of 'help text', if enabled
                if (dataLimit.showInfo) {
                    dataLimitLoadingStatus(rowCount, this.container, this.settings, this.locale);
                }
                this.canFetchMore = this.host.fetchMoreData();
                // Clear down existing info and render if we have no more allocated memory
                if (this.canFetchMore === false || fetchWindowHit) {
                    debug.log(`Memory limit hit after ${this.windowsLoaded} fetch(es). ${rowCount} rows loaded.`);
                    this.container.selectAll('*').remove();
                    displayWindowCapWarning(this.host, this.i18n, rowCount);
                    this.renderVisual(options, debug);
                }
            } else {
                debug.log('We have all the data we can get!');
                const rowAllocationPerc = rowCount / expectedRowCount,
                    windowConfidencePercent = 0.9999, // API doesn't always get 30K rows; usually 30K - 1 so apply confidence based on 4 9's%
                    standardCap = rowCount === windowRows && breaksDataLimit, // Only one window loaded, but we have a segment
                    fetchCap = fetchWindowHit && rowAllocationPerc >= windowConfidencePercent;
                if (standardCap) {
                    debug.log('Row count breaks limit. Displaying warning...');
                    this.host.displayWarningIcon(
                        i18nValue(this.i18n, 'Warning_DataLimit_Title'),
                        i18nValue(this.i18n, 'Warning_DataLimit_Description')
                    );
                }
                if (fetchCap) {
                    displayWindowCapWarning(this.host, this.i18n, rowCount);
                }
                this.renderVisual(options, debug);
            }
        } else {
            debug.log('Data limit options disabled. Skipping over and rendering visual.');
            this.renderVisual(options, debug);
        }
    }

    private updateFetchWindowDetails(options: VisualUpdateOptions) {
        if (options.operationKind === VisualDataChangeOperationKind.Create) {
            this.canFetchMore = true;
            this.windowsLoaded = 1;
        } else {
            this.windowsLoaded++;
        }
    }

    private dataViewIsValid(options: VisualUpdateOptions) {
        return (
            !options.dataViews ||
            !options.dataViews[0] ||
            !options.dataViews[0].metadata ||
            !options.dataViews[0].metadata.columns.filter(c => c.roles['sampling'])[0] ||
            !options.dataViews[0].categorical.values
        );
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
                this.viewModelHandler.mapDataView(options, this.host, this.colourPalette);
                this.viewModelHandler.calculateStatistics(options);
                this.viewModelHandler.sortAndFilterData();
                this.renderLegend();
                this.viewModelHandler.initialiseAxes();
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
        this.viewModelHandler.doKde();
        let viewModel = this.viewModelHandler.viewModel;
        debug.log('View model', viewModel);

        // We may not have any room for anything after we've done our responsiveness chacks, so let's display an indicator
        if (viewModel.yAxis.collapsed || viewModel.xAxis.collapsed) {
            visualCollapsed(this.container);
            debug.log('Visual fully collapsed due to viewport size!');
        } else {
            // Add our main SVG
            debug.log('Plotting SVG canvas...');
            const violinPlotCanvas = plotCanvas(this.container, options.viewport);

            // Watermark for non-production use, if the dev flag is set
            plotWatermark(violinPlotCanvas, this.viewModelHandler.viewport, this.settings);

            // Handle category reduction, if applied
            if (viewModel.categoriesReduced) {
                this.host.displayWarningIcon(
                    i18nValue(this.i18n, 'Warning_CategoryLimit_Title', [this.settings.dataLimit.categoryLimit]),
                    i18nValue(this.i18n, 'Warning_CategoryLimit_Description')
                );
            }

            // Axes
            plotYAxis(violinPlotCanvas, viewModel, this.settings, debug);
            plotXAxis(violinPlotCanvas, viewModel, this.settings, options.viewport, debug);

            // Add series elements
            debug.log('Plotting category elements...');
            const seriesContainer = plotSeriesContainer(violinPlotCanvas, viewModel);

            // Tooltips
            debug.log('Adding tooltip events...');
            bindSeriesTooltipEvents(
                violinPlotCanvas.selectAll('.violinPlotSeries'),
                this.tooltipService,
                this.settings,
                viewModel
            );

            // Visual elements
            debug.log('Rendering violins...');
            renderViolin(seriesContainer, viewModel, this.settings);
            debug.log('Rendering combo plot...');
            renderComboPlot(seriesContainer, viewModel, this.settings);
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
        let debug = new VisualDebugger(this.settings.about.debugMode && this.settings.about.debugVisualUpdate);
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
        this.viewModelHandler.viewModel.profiling.categories.push(debug.getSummary('Legend'));
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
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
        const instances: VisualObjectInstance[] = (<VisualObjectInstanceEnumerationObject>(
            VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options)
        )).instances;
        let objectName = options.objectName;
        let categories: boolean = this.options.dataViews[0].metadata.columns.filter(c => c.roles['category'])[0]
            ? true
            : false;

        // Initial debugging for properties update
        let debug = new VisualDebugger(this.settings.about.debugMode && this.settings.about.debugProperties);
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
                this.resolveDataLimitOptions(instances);
                break;
            }
            case 'about': {
                this.resolveAboutOptions(instances);
                break;
            }
            case 'violin': {
                this.resolveViolinProperties(instances, objectName, categories);
                break;
            }
            case 'dataPoints': {
                this.resolveComboPlotProperties(instances);
                break;
            }
            case 'sorting': {
                this.resolveSortingProperties(instances);
                break;
            }
            case 'tooltip': {
                this.resolveTooltipProperties(instances);
                break;
            }
            case 'dataColours': {
                this.resolveDataColourProperties(instances, objectName);
                break;
            }
            case 'legend': {
                this.resolveLegendProperties(instances);
                break;
            }
            case 'xAxis': {
                this.resolveXAxisProperties(instances);
                break;
            }
            case 'yAxis': {
                this.resolveYAxisProperties(instances);
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

    private resolveDataLimitOptions(instances: powerbi.VisualObjectInstance[]) {
        if (this.settings.dataLimit.fetchWindowCap && this.settings.dataLimit.fetchWindowLimit !== null) {
            // Range validation on fetch window limit
            instances[0].validValues = instances[0].validValues || {};
            instances[0].validValues.fetchWindowLimit = {
                numberRange: {
                    min: 1,
                    max: 1000
                }
            };
        }
        // If not overriding then we don't need to show the additional info options
        if (!this.settings.dataLimit.override) {
            delete instances[0].properties['fetchWindowCap'];
            delete instances[0].properties['fetchWindowLimit'];
            delete instances[0].properties['showInfo'];
            delete instances[0].properties['showCustomVisualNotes'];
        }
        // Hide limit if we turn off cap
        if (!this.settings.dataLimit.fetchWindowCap) {
            delete instances[0].properties['fetchWindowLimit'];
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
                this.options.dataViews[0].categorical.values[0].values.length <= 30000)
        ) {
            instances[0] = null;
            // Set back to capability window cap if removed
            this.settings.dataLimit.override = false;
        }
    }

    private resolveAboutOptions(instances: powerbi.VisualObjectInstance[]) {
        // Version should always show the default
        instances[0].properties['version'] = VisualSettings.getDefault()['about'].version;
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
    }

    private resolveViolinProperties(
        instances: powerbi.VisualObjectInstance[],
        objectName: string,
        categories: boolean
    ) {
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
            for (let category of this.viewModelHandler.viewModel.categories) {
                if (!category) {
                    continue;
                }
                instances.push({
                    objectName: objectName,
                    displayName: category.displayName.formattedName,
                    properties: {
                        categoryBandwidth: category.statistics.bandwidthActual
                    },
                    selector: category.selectionId.getSelector()
                });
            }
        }
    }

    private resolveDataColourProperties(instances: powerbi.VisualObjectInstance[], objectName: string) {
        // Assign default theme colour from palette if default fill colour not overridden
        if (!this.settings.dataColours.defaultFillColour) {
            instances[0].properties['defaultFillColour'] = this.defaultColour;
        }
        // If there are no categories, don't offer the option to colour by them
        if (!this.options.dataViews[0].metadata.columns.filter(c => c.roles['category'])[0]) {
            delete instances[0].properties['colourByCategory'];
            this.settings.dataColours.colourByCategory = false; // This prevents us losing the default fill if we remove the field afterward
        }
        // Add categories if we want to colour by them
        if (this.settings.dataColours.colourByCategory && !this.errorState) {
            delete instances[0].properties['defaultFillColour'];
            for (let category of this.viewModelHandler.viewModel.categories) {
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
    }

    private resolveTooltipProperties(instances: powerbi.VisualObjectInstance[]) {
        // Range validation on precision fields
        instances[0].validValues = instances[0].validValues || {};
        instances[0].validValues.numberSamplesPrecision = instances[0].validValues.measurePrecision = {
            numberRange: {
                min: 0,
                max: 10
            }
        };
    }

    private resolveSortingProperties(instances: powerbi.VisualObjectInstance[]) {
        // Disable/hide if not using categories
        if (!this.options.dataViews[0].metadata.columns.filter(c => c.roles['category'])[0]) {
            instances[0] = null;
        }
    }

    private resolveLegendProperties(instances: powerbi.VisualObjectInstance[]) {
        // Legend title toggle
        if (!this.settings.legend.show && !this.settings.legend.showTitle) {
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
            instances[0].properties['medianText'] = VisualSettings.getDefault()['legend'].medianText;
        }
        if (!this.settings.legend.meanText) {
            instances[0].properties['meanText'] = VisualSettings.getDefault()['legend'].meanText;
        }
        if (!this.settings.legend.dataPointText) {
            instances[0].properties['dataPointText'] = VisualSettings.getDefault()['legend'].dataPointText;
        }
        if (!this.settings.legend.quartileCombinedText) {
            instances[0].properties['quartileCombinedText'] = VisualSettings.getDefault()[
                'legend'
            ].quartileCombinedText;
        }
        if (!this.settings.legend.quartile1Text) {
            instances[0].properties['quartile1Text'] = VisualSettings.getDefault()['legend'].quartile1Text;
        }
        if (!this.settings.legend.quartile3Text) {
            instances[0].properties['quartile3Text'] = VisualSettings.getDefault()['legend'].quartile3Text;
        }
    }

    private resolveXAxisProperties(instances: powerbi.VisualObjectInstance[]) {
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
    }

    private resolveYAxisProperties(instances: powerbi.VisualObjectInstance[]) {
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
                max: this.settings.yAxis.end === 0 ? 0 : this.settings.yAxis.end || safeMax
            }
        };
        instances[0].validValues.end = {
            numberRange: {
                min: this.settings.yAxis.start === 0 ? 0 : this.settings.yAxis.start || safeMin,
                max: safeMax
            }
        };
    }

    private resolveComboPlotProperties(instances: powerbi.VisualObjectInstance[]) {
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
                delete instances[0].properties['quartile1StrokeLineStyle'];
                delete instances[0].properties['quartile3FillColour'];
                delete instances[0].properties['quartile3StrokeWidth'];
                delete instances[0].properties['quartile3StrokeLineStyle'];
                // Toggle mean
                if (!this.settings.dataPoints.showMean) {
                    delete instances[0].properties['meanFillColour'];
                    delete instances[0].properties['meanStrokeWidth'];
                    delete instances[0].properties['meanFillColourInner'];
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
                    delete instances[0].properties['quartile1FillColour'];
                    delete instances[0].properties['quartile1StrokeWidth'];
                    delete instances[0].properties['quartile1StrokeLineStyle'];
                    delete instances[0].properties['quartile3FillColour'];
                    delete instances[0].properties['quartile3StrokeWidth'];
                    delete instances[0].properties['quartile3StrokeLineStyle'];
                }
                break;
            }
            case 'columnPlot': {
                // Remove non-column plot properties
                delete instances[0].properties['showWhiskers'];
                delete instances[0].properties['barColour'];
                // Toggle quartile properties
                if (!this.settings.dataPoints.showQuartiles) {
                    delete instances[0].properties['quartile1FillColour'];
                    delete instances[0].properties['quartile1StrokeWidth'];
                    delete instances[0].properties['quartile1StrokeLineStyle'];
                    delete instances[0].properties['quartile3FillColour'];
                    delete instances[0].properties['quartile3StrokeWidth'];
                    delete instances[0].properties['quartile3StrokeLineStyle'];
                }
                // Toggle mean
                if (!this.settings.dataPoints.showMean) {
                    delete instances[0].properties['meanFillColour'];
                    delete instances[0].properties['meanStrokeWidth'];
                    delete instances[0].properties['meanFillColourInner'];
                }
            }
        }
    }
}
