/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    'use strict';

    /** powerbi.extensibility.utils.tooltip */
        import tooltip = powerbi.extensibility.utils.tooltip;
        import TooltipEventArgs = powerbi.extensibility.utils.tooltip.TooltipEventArgs;
        import ITooltipServiceWrapper = powerbi.extensibility.utils.tooltip.ITooltipServiceWrapper;

    /** powerbi.extensibility.utils.chart.legend */
        import createLegend = powerbi.extensibility.utils.chart.legend.createLegend;
        import ILegend = powerbi.extensibility.utils.chart.legend.ILegend;
        import Legend = powerbi.extensibility.utils.chart.legend;
        import LegendData = powerbi.extensibility.utils.chart.legend.LegendData;
        import LegendIcon = powerbi.extensibility.utils.chart.legend.LegendIcon;
        import LegendPosition = powerbi.extensibility.utils.chart.legend.LegendPosition;

    /** powerbi.extensibility.utils.formatting */
        import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;

    /** ViolinPlotHelpers */
        import ViewModelHandler = ViolinPlotHelpers.ViewModelHandler;
        import VisualDebugger = ViolinPlotHelpers.VisualDebugger;
        import renderViolin = ViolinPlotHelpers.renderViolin;
        import renderBoxPlot = ViolinPlotHelpers.renderBoxPlot;
        import renderBarcodePlot = ViolinPlotHelpers.renderBarcodePlot;
        import visualUsage = ViolinPlotHelpers.visualUsage;
        import visualCollapsed = ViolinPlotHelpers.visualCollapsed;
        import getHighlightedDataPoints = ViolinPlotHelpers.getHighlightedDataPoints;

    /** ViolinPlotModels */
        import IViewModel = ViolinPlotModels.IViewModel;
        import ICategory = ViolinPlotModels.ICategory;
        import IVisualDataPoint = ViolinPlotModels.IVisualDataPoint;
    
    export class ViolinPlot implements IVisual {
        private element: HTMLElement;
        private container: d3.Selection<{}>;
        private settings: VisualSettings;
        private options: VisualUpdateOptions;
        private colourPalette: ISandboxExtendedColorPalette;
        private defaultColour: string;
        private host: IVisualHost;
        private viewModelHandler: ViewModelHandler;
        private tooltipServiceWrapper: ITooltipServiceWrapper;
        private errorState: boolean;
        private legend: ILegend;
        private legendData: LegendData;
        private canFetchMore: boolean;
        private windowsLoaded: number;

        /**
         * Instantiation of the visual
         * @param options 
         */
            constructor(options: VisualConstructorOptions) {
                this.element = options.element;
                this.colourPalette = options.host.colorPalette;
                this.host = options.host;
                this.tooltipServiceWrapper = tooltip.createTooltipServiceWrapper(this.host.tooltipService, options.element);
                this.defaultColour = this.colourPalette['colors'][0].value;
                this.viewModelHandler = new ViewModelHandler();

                /** Legend container */
                    this.legend = createLegend(
                        options.element,
                        false,
                        null,
                        true,
                        LegendPosition.Top
                    );

                /** Visual container */
                    this.container = d3.select(options.element)
                        .append('div')
                            .classed('violinPlotContainer', true);

            }

        /**
         * Visual update event handling
         * @param options 
         */
            public update(options: VisualUpdateOptions) {
                this.options = options;
                this.settings = ViolinPlot.parseSettings(options && options.dataViews && options.dataViews[0]);
                this.errorState = false;
                this.viewModelHandler.clearProfiling();
                this.viewModelHandler.settings = this.settings;
                this.viewModelHandler.viewport = options.viewport;
                if (!this.legendData) {
                    this.legendData = {
                        dataPoints: []
                    };
                }

                /** Initial debugging for visual update */
                    this.viewModelHandler.debug = this.settings.about.debugMode && this.settings.about.debugVisualUpdate;
                    let debug = new VisualDebugger(this.settings.about.debugMode && this.settings.about.debugVisualUpdate);
                    debug.clear();
                    debug.heading('Visual Update');
                    debug.log(`Update type: ${VisualUpdateType[options.type]}, enum Value: ${options.type}`);
                    debug.profileStart();
                    debug.log('Settings', this.settings);
                    debug.log('Viewport (Pre-legend)', options.viewport);

                /** This is a bit hacky, but I wanted to populate the default colour in parseSettings. I could manage it for the properties pane
                 *  (and that code remains in-place below) but not in the settings object, so this "coerces" it based on the palette's first 
                 *  assigned colour.
                 */
                    if (!this.settings.dataColours.defaultFillColour) {
                        this.settings.dataColours.defaultFillColour = this.defaultColour;
                    }

                /** Clear down existing plot */
                    this.container.selectAll('*').remove();
                
                /** Size our initial container to match the viewport 
                 *  TODO: we could compare this on resize and do the appropriate calculations to minimise rework
                 */
                    this.container.attr({
                        width: `${options.viewport.width}`,
                        height: `${options.viewport.height}`,
                    });

                /** Things that can terminate the update process early */

                    /** Validation of inputs and display a nice message */
                        if (!options.dataViews
                            || !options.dataViews[0]
                            || !options.dataViews[0].metadata
                            || !options.dataViews[0].metadata.columns.filter(c => c.roles['sampling'])[0]
                            || !options.dataViews[0].categorical.values
                        ) {
                            this.errorState = true;
                            this.renderLegend();
                            visualUsage(this.container, this.host, this.settings);
                            if (debug) {
                                debug.log('Update cancelled due to incomplete fields.');
                                debug.footer();
                            }
                            return;
                        }

                    /** Look for more data and load it if we can. This will trigger a subsequent update so we need to try and avoid re-rendering 
                     *  while we're fetching more data.
                     *  
                     *  For people viewing the source code, this option is hard-switched off in the settings, as I have observed some issues when
                     *  using categories and individual data colours (the property pane breaks), as well as resizing the visual (sometimes it just
                     *  doesn't trigger the update correctly, which is likely causing an exception somewhere in the render code). The 1.x API has
                     *  memory leak issues, which don't help with diagnosis. The fecthMoreData() function is also broken in v2.1 and v2.2 of the custom
                     *  visuals API in different ways, so I'm hoping to revist later on. The code is here for posterity in the hope that I can just 
                     *  switch it on once I find a suitable API version.
                     *  
                     *  TODO: Convert to bootstrap layout
                     */
                        if (this.settings.dataLimit.enabled) {
                            if (options.operationKind == VisualDataChangeOperationKind.Create) {
                                this.canFetchMore = true;
                                this.windowsLoaded = 1;
                            } else {
                                this.windowsLoaded++;
                            }

                            let rowCount = options.dataViews[0].categorical.values[0].values.length,
                                rowCountFormatter = valueFormatter.create({
                                    format: '#,##0'
                                });

                            if (        options.dataViews[0].metadata.segment 
                                    &&  this.settings.dataLimit.override
                                    &&  this.canFetchMore
                            ) {
                                debug.log('Not all data loaded. Loading more (if we can...)...');
                                debug.log(`We have loaded ${this.windowsLoaded} times so far.`);

                                /** Handle rendering of 'help text', if enabled */
                                if (this.settings.dataLimit.showInfo) {
                                    let infoContainer = this.container
                                        .append('div')
                                            .classed('violinPlotError', true);
                                    infoContainer                        
                                        .append('div')
                                            .html(`&#128712;&nbsp;&nbsp;Loading more values (${rowCountFormatter.format(rowCount)} currently loaded)...`
                                                +   (this.settings.dataLimit.showCustomVisualNotes
                                                        ?   `<br/><br/><hr/>\
                                                            <h3>Info for Report Authors</h3>
                                                            Custom visuals have a cap of 30,000 rows. Recent changes allow us to exceed this by loading  more data from the data model \
                                                                until until Power BI's memory allocation limit for the visual is reached.<br/><br/>\
                                                            This can be costly and will run for every update to your visual.<br/><br/>
                                                            If you are making changes to your visual layout then it is recommended that you turn off <strong>Override Row Limit</strong> \
                                                                in in the <strong>Data Limit Options</strong> pane while doing so, and then enabling it when finished.<br/><br/>\
                                                            You can turn off <strong>Show custom Visual Notes</strong> to hide these notes for end-users.\
                                                            `
                                                        :   '')
                                                    );
                                    }
                                    this.canFetchMore = this.host.fetchMoreData();
                                    /** Clear down existing info and render if we have no more allocated memory */
                                        if (!this.canFetchMore) {
                                            debug.log(`Memory limit hit after ${this.windowsLoaded} fetch(es). We managed to get ${rowCount} rows.`);
                                            this.container.selectAll('*').remove();
                                            this.renderVisual(options, debug);
                                        }
                            } else {
                                debug.log('We have all the data we can get!');
                                this.renderVisual(options, debug);
                            }
                        } else {
                            debug.log('Data limit options disabled. Skipping over and rendering visual.');
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

                            this.viewModelHandler.mapDataView(options, this.host, this.colourPalette);
                            this.viewModelHandler.calculateStatistics();
                            this.viewModelHandler.sortAndFilterData();

                            /** Construct legend from measures. We need our legend before we can size the rest of the chart, so we'll do this first. */
                                if (this.viewModelHandler.viewModel.categoryNames) {
                                    debug.log('Creating legend data...');
                                    this.legendData = {
                                        title: this.settings.legend.showTitle 
                                                    ? this.settings.legend.titleText 
                                                        ?   this.settings.legend.titleText
                                                        :   options.dataViews[0].metadata.columns.filter(c => c.roles['category'])[0].displayName
                                                    : null,
                                        fontSize: this.settings.legend.fontSize,
                                        labelColor: this.settings.legend.fontColor,
                                        dataPoints: this.viewModelHandler.viewModel.categories.map(c => (
                                            {
                                                label: c.name,
                                                color: c.colour,
                                                icon: LegendIcon.Circle,
                                                selected: false,
                                                identity: c.selectionId
                                            }
                                        ))
                                    }
                                    debug.log('Legend data instantiated.');
                                    debug.footer();
                                }
                                
                            this.viewModelHandler.initialiseAxes(options);

                            break;
                        }
                        default: {
                            debug.log('No need to re-map data. Skipping over...');
                        }
                    }

                    this.renderLegend();
                    debug.log('Viewport (Post-legend)', this.viewModelHandler.viewport);
                    debug.log('Data View', options.dataViews[0]);
                    
                /** Map the rest of the view model */
                    this.viewModelHandler.processAxisText(); 
                    this.viewModelHandler.doKde();  
                    let viewModel = this.viewModelHandler.viewModel;
                    debug.log('View model', viewModel);

                /** We may not have any room for anything after we've done our responsiveness chacks, so let's display an indicator */
                    if (viewModel.yAxis.collapsed || viewModel.xAxis.collapsed) {

                        visualCollapsed(this.container);
                        debug.log('Visual fully collapsed due to viewport size!');
                        
                    } else {

                        /** Add our main SVG */
                            debug.log('Plotting SVG canvas...');
                            let violinPlotCanvas = this.container
                                .append('svg')
                                    .classed('violinPlotCanvas', true)
                                    .attr({
                                        width: `${options.viewport.width}`,
                                        height: `${options.viewport.height}`
                                    });

                        /** Handle category reduction, if applied */
                            if (viewModel.categoriesReduced) {
                                debug.log('Plotting warning icon and interactivity...');
                                let warningElement = violinPlotCanvas
                                    .append('g')
                                        .classed('condensedWarning', true)
                                        .attr({
                                            'transform': `translate(${this.viewModelHandler.viewport.width - 20}, ${20})`,
                                            'opacity': '0.6'
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

                        /** Create a Y axis */
                            if (this.settings.yAxis.show) {

                                debug.log('Plotting y-axis...');
                                let yAxisContainer = violinPlotCanvas
                                    .append('g')
                                        .classed('yAxisContainer', true)
                                        .style({
                                            'font-size': viewModel.yAxis.labelTextProperties.fontSize,
                                            'font-family': this.settings.yAxis.fontFamily,
                                            'fill': this.settings.yAxis.fontColor,
                                        });

                                /** Add title if required */
                                    if (this.settings.yAxis.showTitle && viewModel.yAxis.titleDisplayName && viewModel.yAxis.titleDimensions.width > 0) {
                                        
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
                                                    'font-size': viewModel.yAxis.titleDisplayName.textProperties.fontSize,
                                                    'font-family': this.settings.yAxis.titleFontFamily,
                                                    'fill': this.settings.yAxis.titleColor
                                                })
                                                .text(viewModel.yAxis.titleDisplayName.tailoredName)
                                    }

                                debug.log('Plotting y-axis ticks...');
                                let yAxisTicks = yAxisContainer
                                    .append('g')
                                        .classed({
                                            'yAxis': true,
                                            'grid': true
                                        })
                                        .attr('transform', `translate(${viewModel.yAxis.dimensions.width}, 0)`)
                                    .call(viewModel.yAxis.generator);

                                /** Apply gridline styling */
                                    debug.log('Applying y-axis gridline styling...');
                                    yAxisTicks.selectAll('line')
                                        .attr({
                                            stroke: this.settings.yAxis.gridlineColor,
                                            'stroke-width': this.settings.yAxis.gridlines
                                                ? this.settings.yAxis.gridlineStrokeWidth
                                                : 0
                                        })
                                        .classed(this.settings.yAxis.gridlineStrokeLineStyle, true);

                            }
                        
                        /** Create an X-axis */
                            if (this.settings.xAxis.show) {

                                debug.log('Plotting x-axis...');
                                let xAxisContainer = violinPlotCanvas
                                    .append('g')
                                    .classed('xAxisContainer', true)
                                        .style({
                                            'font-size': viewModel.xAxis.labelTextProperties.fontSize,
                                            'font-family': this.settings.xAxis.fontFamily,
                                            'fill': this.settings.xAxis.fontColor
                                        });
                                
                                debug.log('Plotting x-axis ticks...');
                                let xAxisTicks = xAxisContainer
                                    .append('g')
                                        .classed({
                                            'xAxis': true,
                                            'grid': true
                                        })
                                        .attr('transform', `translate(${viewModel.yAxis.dimensions.width}, ${options.viewport.height - viewModel.xAxis.dimensions.height})`)
                                    .call(viewModel.xAxis.generator);

                                /** Apply gridline styling */
                                    debug.log('Applying x-axis gridline styling...');
                                    xAxisTicks.selectAll('line')
                                        .attr({
                                            stroke: this.settings.xAxis.gridlineColor,
                                            'stroke-width': this.settings.xAxis.gridlines
                                                ? this.settings.xAxis.gridlineStrokeWidth
                                                : 0
                                        })
                                        .classed(this.settings.xAxis.gridlineStrokeLineStyle, true);

                                /** Add title if required */
                                    if (this.settings.xAxis.showTitle && viewModel.xAxis.titleDisplayName && viewModel.xAxis.titleDimensions.height > 0) {

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
                                                    'font-size': viewModel.xAxis.titleDisplayName.textProperties.fontSize,
                                                    'font-family': this.settings.xAxis.titleFontFamily,
                                                    'fill': this.settings.xAxis.titleColor,
                                                })
                                                .text(viewModel.xAxis.titleDisplayName.tailoredName);
                                    }

                            }

                        /** Do the rest, if required */
                        
                            /** Add series elements */
                                debug.log('Plotting category elements...');
                                let seriesContainer = violinPlotCanvas.selectAll('.violinPlotCanvas')
                                    .data(viewModel.categories)
                                    .enter()
                                    .append('g')
                                        .classed({
                                            'violinPlotSeries': true
                                        })
                                        .attr({
                                            'transform': (d) => `translate(${viewModel.xAxis.scale(d.name) + viewModel.yAxis.dimensions.width}, 0)`,
                                            'width': viewModel.xAxis.scale.rangeBand()
                                        });

                            /** Tooltips */
                                if (this.settings.tooltip.show) {
                                    debug.log('Adding tooltip events...');
                                    this.tooltipServiceWrapper.addTooltip(
                                        violinPlotCanvas.selectAll('.violinPlotSeries'),
                                        (tooltipEvent: TooltipEventArgs<number>) => ViolinPlot.getTooltipData(
                                            tooltipEvent, 
                                            this.settings, 
                                            viewModel
                                        ),
                                        (tooltipEvent: TooltipEventArgs<number>) => null,
                                        true
                                    )
                                    this.tooltipServiceWrapper.addTooltip(
                                        violinPlotCanvas.selectAll('.condensedWarning'),
                                        (tooltipEvent: TooltipEventArgs<number>) => ViolinPlot.getTruncationTooltipData(this.settings),
                                        (tooltipEvent: TooltipEventArgs<number>) => null
                                    )
                                }

                            /** Violin plot */
                                debug.log('Rendering violins...');
                                renderViolin(seriesContainer, viewModel, this.settings);

                            /** Box plot */
                                if (this.settings.dataPoints.show) {
                                    switch (this.settings.dataPoints.plotType) {

                                        case 'box': {
                                            debug.log('Rendering box plots...');
                                            renderBoxPlot(seriesContainer, viewModel, this.settings);
                                            break;
                                        }

                                        case 'barcode': {
                                            debug.log('Rendering barcode plots...');
                                            renderBarcodePlot(seriesContainer, viewModel, this.settings);
                                            break;
                                        }

                                    }
                                }

                    }

                /** Success! */
                    debug.log('Visual fully rendered!');
                    viewModel.profiling.categories.push(debug.getSummary('Total'));
                    debug.footer();

            }

        /** Tooltip to display in the event of too many categories for the visual. As we handle this independently of the dataReductionAlgorithm,
         *  we need to indicate this to the user some other way.
         */
            private static getTruncationTooltipData(settings: VisualSettings): VisualTooltipDataItem[] {
                return [
                    {
                        displayName: `Category values limited to ${settings.dataLimit.categoryLimit} unique values for \
                            performance reasons. Not displaying all data. Filter the data or choose another field.`,
                        value: ''
                    }
                ]
            }

        /**
         * For a highlighted data point, get its tooltip data and return it to the `tooltipServiceWrapper`.
         * Behaviour will depend on the tooltip settings, so this will handle the adding or omission of statistics accordingly.
         * @param value 
         * @param settings 
         * @param viewModel 
         */
            private static getTooltipData(tooltipEvent: any, settings: VisualSettings, viewModel: IViewModel): VisualTooltipDataItem[] {
                let debug = new VisualDebugger(settings.about.debugMode && settings.about.debugTooltipEvents);
                debug.log('Instantiating tooltip...');

                let tte = <TooltipEventArgs<Number>>tooltipEvent,
                    v: ICategory = tooltipEvent.data,
                    s = settings.tooltip,
                    f = viewModel.yAxis.labelFormatter,
                    dataPoint: boolean,
                    highlightedValue: number,
                    tooltips: VisualTooltipDataItem[] = [];

                /** Depending on the element we have in context, we will possibly need to display a highlighted data value in the tooltip, and
                 *  an assistive element to indicate which one is highlighted. We handle this here.
                 */
                    if (tooltipEvent.context.classList.contains('violinPlotComboPlotOverlay')) {
                        debug.log('Combo Plot Overlay Highlighted');
                        dataPoint = true;
                        highlightedValue = getHighlightedDataPoints(d3.select(tte.context), tte.coordinates, viewModel.yAxis);
                        d3.select(tte.context.parentNode)
                            .select('.barcodeToolipDataPoint')
                                .attr({
                                    y1: viewModel.yAxis.scale(highlightedValue),
                                    y2: viewModel.yAxis.scale(highlightedValue)
                                })
                                .style('display', null);
                        debug.log(`Highlighted Value: ${highlightedValue}`);
                    } else {
                        debug.log('Category Highlighted');
                    }

                tooltips.push(
                    {
                        displayName: 'Category',
                        value: v.displayName.formattedName ? v.displayName.formattedName : 'All Data',
                        color: v.colour
                    },
                    {
                        displayName: '# Samples',
                        value: valueFormatter.create({
                            format: "#,##0"
                        }).format(v.dataPoints.length)
                    }
                );
                debug.log('Pushed category and samples');

                if (s.showMaxMin) {
                    tooltips.push(
                        {
                            displayName: 'Maximum',
                            value: f.format(v.statistics.max)
                        },
                        {
                            displayName: 'Minimum',
                            value: f.format(v.statistics.min)
                        }
                    );
                    debug.log('Pushed max/min');
                }

                if (s.showSpan) {
                    tooltips.push({
                        displayName: 'Span (Min to Max)',
                        value: f.format(v.statistics.span)
                    });
                    debug.log('Pushed span');
                }

                if (s.showMedian) {
                    tooltips.push({
                        displayName: 'Median',
                        value: f.format(v.statistics.median)
                    });
                    debug.log('Pushed median');
                }

                if (s.showMean) {
                    tooltips.push({
                        displayName: 'Mean',
                        value: f.format(v.statistics.mean)
                    });
                    debug.log('Pushed mean');
                }

                if (s.showDeviation) {
                    tooltips.push({
                        displayName: 'Standard Deviation',
                        value: f.format(v.statistics.deviation)
                    });
                    debug.log('Pushed standard deviation');
                }

                if (s.showQuartiles) {
                    tooltips.push(
                        {
                            displayName: 'Upper Quartile',
                            value: f.format(v.statistics.quartile3)
                        },
                        {
                            displayName: 'Lower Quartile',
                            value: f.format(v.statistics.quartile1)
                        }
                    );
                    debug.log('Pushed upper/lower quartile');
                }

                if (s.showIqr) {
                    tooltips.push({
                        displayName: 'Inter Quartile Range',
                        value: f.format(v.statistics.iqr)
                    });
                    debug.log('Pushed IQR');
                }

                if (s.showConfidence) {
                    tooltips.push(
                        {
                            displayName: 'Upper Whisker (95%)',
                            value: f.format(v.statistics.confidenceUpper)
                        },
                        {
                            displayName: 'Lower Whisker (5%)',
                            value: f.format(v.statistics.confidenceLower)
                        }
                    );
                    debug.log('Pushed confidence');
                }

                if (s.showBandwidth) {
                    if (settings.violin.specifyBandwidth) {
                        tooltips.push({
                            displayName: 'Bandwidth (Specified)',
                            value: f.format(viewModel.statistics.bandwidthActual)
                        });
                        debug.log('Pushed specified bandwidth');
                    }
                    tooltips.push({
                        displayName: `Bandwidth (Estimated${settings.violin.specifyBandwidth ? ', N/A' : ''})`,
                        value: f.format(viewModel.statistics.bandwidthSilverman)
                    });
                    debug.log('Pushed estimated bandwidth');
                }

                if (dataPoint) {
                    tooltips.push({
                        displayName: viewModel.measure,
                        value: f.format(highlightedValue)
                    });
                    debug.log('Pushed data point value');
                }

                debug.log('Tooltip Data', tooltips);
                return tooltips;
            }

        /** Renders the legend, based on the properties supplied in the update method */
            private renderLegend(): void {

                let debug = new VisualDebugger(this.settings.about.debugMode && this.settings.about.debugVisualUpdate);
                debug.footer();
                debug.log('Rendering legend...');
                debug.profileStart();
                
                /** Only show if legend is enabled and we colour by category */
                    let position: LegendPosition = this.settings.legend.show 
                        && !this.errorState 
                        && this.settings.dataColours.colourByCategory
                        && this.viewModelHandler.viewModel.categoryNames
                            ?   LegendPosition[this.settings.legend.position]
                            :   LegendPosition.None;
                    debug.log(`Position: ${LegendPosition[position]}`);

                /** For us to tell if the legend is going to work, we need to draw it first in order to get its dimensions */
                    this.legend.changeOrientation(position);
                    debug.log('Legend orientation set.');
                    this.legend.drawLegend(this.legendData, this.viewModelHandler.viewport);
                    debug.log('Legend drawn.');

                /** If this exceeds our limits, then we will hide and re-draw prior to render */
                    let legendBreaksViewport = false;
                    switch (this.legend.getOrientation()) {
                        case LegendPosition.Left:
                        case LegendPosition.LeftCenter:
                        case LegendPosition.Right:
                        case LegendPosition.RightCenter:
                            legendBreaksViewport = 
                                    (this.viewModelHandler.viewport.width - this.legend.getMargins().width < this.settings.legend.widthLimit)
                                ||  (this.viewModelHandler.viewport.height < this.settings.legend.heightLimit);
                            break;
                        case LegendPosition.Top:
                        case LegendPosition.TopCenter:
                        case LegendPosition.Bottom:
                        case LegendPosition.BottomCenter:
                        legendBreaksViewport =         
                                    (this.viewModelHandler.viewport.height - this.legend.getMargins().height < this.settings.legend.heightLimit)
                                ||  (this.viewModelHandler.viewport.width < this.settings.legend.widthLimit);
                            break;
                    }

                /** Adjust viewport (and hide legend) as appropriate */
                    debug.log('Legend dimensions', this.legend.getMargins());
                    if (legendBreaksViewport) {
                        debug.log('Legend dimensions cause the viewport to become unusable. Skipping over render...');
                        this.legend.changeOrientation(LegendPosition.None);
                        this.legend.drawLegend(this.legendData, this.viewModelHandler.viewport);
                    } else {
                        debug.log('Legend dimensions are good to go!');
                        this.viewModelHandler.viewport.width -= this.legend.getMargins().width;
                        this.viewModelHandler.viewport.height -= this.legend.getMargins().height;
                    }
                    Legend.positionChartArea(this.container, this.legend);
                    debug.log('Legend fully positioned.');
                    this.viewModelHandler.viewModel.profiling.categories.push(debug.getSummary('Legend'));
                    debug.footer();

            }

        /**
         * Parses and gets the visual settings
         * @param dataView 
         */
            private static parseSettings(dataView: DataView): VisualSettings {
                return VisualSettings.parse(dataView) as VisualSettings;
            }

        /** 
         * This function gets called for each of the objects defined in the `capabilities.json` file and allows you to select which of the 
         * objects and properties you want to expose to the users in the property pane.
         */
            public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
                const instances: VisualObjectInstance[] = (VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options) as VisualObjectInstanceEnumerationObject).instances;
                let objectName = options.objectName;

                /** Initial debugging for properties update */
                    let debug = new VisualDebugger(this.settings.about.debugMode && this.settings.about.debugProperties);
                    debug.heading(`Properties: ${objectName}`);

                /** Apply instance-specific transformations */
                    switch (objectName) {
                        /** The data limit options were intended to be enabled in conditions where we could fetch more data from the model, but there have been
                         *  some issues in getting this to work reliably, so for now they are turned off. Refer to notes above in `update()` for more details as
                         *  to why. As the code represents a fair bit of work to get the implementation going, we'll enable it based on the `enabled` property
                         *  in the `dataLimitSettings` class, once we can get this to work reliably. For now this is left for anyone interested in the source code,
                         *  to see where I got to with it as a feature.
                         */
                        case 'dataLimit': {
                            /** If not overriding then we don't need to show the addiitonal info options */
                                if (!this.settings.dataLimit.override) {
                                    delete instances[0].properties['showInfo'];
                                    delete instances[0].properties['showCustomVisualNotes'];
                                }
                            /** Developer notes won't be an option if we hide the loading progress */
                                if (!this.settings.dataLimit.showInfo) {
                                    delete instances[0].properties['showCustomVisualNotes'];
                                }
                            /** If we have less than 30K rows in our data set then we don't need to show it */
                                if (        !this.settings.dataLimit.enabled
                                        ||  (
                                                    !this.options.dataViews[0].metadata.segment
                                                &&  (
                                                            this.options.dataViews[0].categorical.values 
                                                        &&  this.options.dataViews[0].categorical.values[0].values.length <= 30000
                                                    )
                                            )
                                ) {
                                    instances[0] = null;
                                    /** Set back to capability window cap if removed */
                                    this.settings.dataLimit.override = false;
                                }
                            break;
                        }
                        case 'about' : {
                            /** Switch off and hide debug mode if development flag is disabled */
                                if(!this.settings.about.development) {
                                    delete instances[0].properties['debugMode'];
                                    delete instances[0].properties['debugVisualUpdate'];
                                    delete instances[0].properties['debugTooltipEvents'];
                                    delete instances[0].properties['debugProperties'];
                                }
                            /** Reset the individual flags if debug mode switched off */
                                if(!this.settings.about.debugMode) {
                                    instances[0].properties['debugMode'] = false;
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
                            /** Range validation on stroke width */
                                instances[0].validValues = instances[0].validValues || {};
                                instances[0].validValues.strokeWidth = {
                                    numberRange: {
                                        min: 1,
                                        max: 5
                                    },
                                };
                            /** Range validation on inner padding (0% - 50%) */
                                instances[0].validValues.innerPadding = {
                                    numberRange: {
                                        min: 0,
                                        max: 50
                                    }
                                };
                            /** Enable options for different violin types (currently only line) */
                                if (this.settings.violin.type !== 'line') {
                                    delete instances[0].properties['strokeWidth'];
                                    delete instances[0].properties['clamp'];
                                    delete instances[0].properties['resolution'];
                                    delete instances[0].properties['kernel'];
                                    delete instances[0].properties['specifyBandwidth'];
                                }
                            /** Manual bandwidth toggle */
                                if (!this.settings.violin.specifyBandwidth) {
                                    delete instances[0].properties['bandwidth'];
                                };
                            break;
                        }
                        case 'dataPoints': {
                            /** Range validation on stroke width */
                                instances[0].validValues = instances[0].validValues || {};
                                instances[0].validValues.strokeWidth = {
                                    numberRange: {
                                        min: 1,
                                        max: 5
                                    },
                                };
                            /** Range validation on box plot width */
                                instances[0].validValues.innerPadding = {
                                    numberRange: {
                                        min: 50,
                                        max: 90
                                    },
                                };

                            /** Data point-plot specific behaviour */
                                switch (this.settings.dataPoints.plotType) {

                                    case 'box': {

                                        /** Remove non-box plot properties */
                                            delete instances[0].properties['barColour'];

                                        /** Toggle median colour */
                                            if (!this.settings.dataPoints.showMedian) {
                                                delete instances[0].properties['medianFillColour'];
                                            }
                                        /** Toggle mean colours */
                                            if (!this.settings.dataPoints.showMean) {
                                                delete instances[0].properties['meanFillColour'];
                                                delete instances[0].properties['meanFillColourInner'];
                                            }

                                        break;
                                    }

                                    case 'barcode': {

                                        /** Remove non-barcode plot properties */
                                            delete instances[0].properties['transparency'];    
                                            delete instances[0].properties['boxFillColour'];
                                            delete instances[0].properties['showWhiskers'];
                                            delete instances[0].properties['showMedian'];
                                            delete instances[0].properties['medianFillColour'];
                                            delete instances[0].properties['showMean'];
                                            delete instances[0].properties['meanFillColour'];
                                            delete instances[0].properties['meanFillColourInner'];

                                        break;
                                    }

                                }

                            
                            break;
                        }
                        case 'sorting': {
                            /** Disable/hide if not using categories */
                                if (!this.options.dataViews[0].metadata.columns.filter(c => c.roles['category'])[0]) {
                                    instances[0] = null;
                                }
                            break;
                        }
                        case 'tooltip': {
                            /** Range validation on grid line stroke width and precision */
                                instances[0].validValues = instances[0].validValues || {};
                                instances[0].validValues.precision = {
                                    numberRange: {
                                        min: 0,
                                        max: 10
                                    }
                                };
                            break;
                        }
                        case 'dataColours': {
                            /** Assign default theme colour from palette if default fill colour not overridden */
                                if (!this.settings.dataColours.defaultFillColour) {
                                    instances[0].properties['defaultFillColour'] = this.defaultColour;
                                }
                            /** If there are no categories, don't offer the option to colour by them */
                                if (!this.options.dataViews[0].metadata.columns.filter(c => c.roles['category'])[0]) {
                                    delete instances[0].properties['colourByCategory'];
                                    this.settings.dataColours.colourByCategory = false; /** This prevents us losing the default fill if we remove the field afterward */
                                }
                            /** Add categories if we want to colour by them */
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
                            break;
                        }
                        case 'legend': {
                            /** Disable/hide if not using Data Colours by Category */
                                if (!this.settings.dataColours.colourByCategory) {
                                    instances[0] = null;
                                }
                            /** Legend title toggle */
                                if (!this.settings.legend.show && !this.settings.legend.showTitle) {
                                    delete instances[0].properties['titleText'];
                                }
                            break;
                        }
                        case 'xAxis': {
                            /** Label toggle */
                                if (!this.settings.xAxis.showLabels) {
                                    delete instances[0].properties['fontColor'];
                                    delete instances[0].properties['fontSize'];
                                    delete instances[0].properties['fontFamily'];
                                }     
                            /** Gridline toggle */
                                if (!this.settings.xAxis.gridlines) {
                                    delete instances[0].properties['gridlineColor'];
                                    delete instances[0].properties['gridlineStrokeWidth'];
                                    delete instances[0].properties['gridlineStrokeLineStyle'];
                                }
                            /** Title toggle */
                                if (!this.settings.xAxis.showTitle) {
                                    delete instances[0].properties['titleColor'];
                                    delete instances[0].properties['titleText'];
                                    delete instances[0].properties['titleFontSize'];
                                    delete instances[0].properties['titleFontFamily'];
                                }
                            /** Range validation on grid line stroke width */
                                instances[0].validValues = instances[0].validValues || {};
                                instances[0].validValues.gridlineStrokeWidth = {
                                    numberRange: {
                                        min: 1,
                                        max: 5
                                    },
                                };
                            break;
                        }
                        case 'yAxis': {
                            /** Label toggle */
                                if (!this.settings.yAxis.showLabels) {
                                    delete instances[0].properties['fontColor'];
                                    delete instances[0].properties['fontSize'];
                                    delete instances[0].properties['fontFamily'];
                                    delete instances[0].properties['labelDisplayUnits'];
                                    delete instances[0].properties['precision'];
                                }                    
                            /** Gridline toggle */
                                if (!this.settings.yAxis.gridlines) {
                                    delete instances[0].properties['gridlineColor'];
                                    delete instances[0].properties['gridlineStrokeWidth'];
                                    delete instances[0].properties['gridlineStrokeLineStyle'];
                                }
                            /** Title toggle */
                                if (!this.settings.yAxis.showTitle) {
                                    delete instances[0].properties['titleStyle'];
                                    delete instances[0].properties['titleColor'];
                                    delete instances[0].properties['titleText'];
                                    delete instances[0].properties['titleFontSize'];
                                    delete instances[0].properties['titleFontFamily'];
                                }
                            /** Title style toggle if units are none */
                                if (this.settings.yAxis.labelDisplayUnits == 1) {
                                    instances[0].properties['titleStyle'] = 'title'; /** TODO: Delete entries from list */
                                }
                            /** Range validation on grid line stroke width and precision */
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
                                    },
                                };
                            break;
                        }
                    }

                /** Output all transformed instance info if we're debugging */
                    instances.map(function (instance) {
                        debug.log(instance.objectName, instance);
                    });
                    debug.log('Properties fully processed!');
                    debug.footer();

                return instances;
            }
    }
}