module powerbi.extensibility.visual {

    export module ViolinPlotHelpers {

        /** Internal view models */
            import IViewModel = ViolinPlotModels.IViewModel;
            import EViolinSide = ViolinPlotModels.EViolinSide;
            import EBoxPlotWhisker = ViolinPlotModels.EBoxPlotWhisker;

        /**
         * Gets property value for a particular object in a category.
         *
         * @function
         * @param {DataViewCategoryColumn} category             - List of category objects.
         * @param {number} index                                - Index of category object.
         * @param {string} objectName                           - Name of desired object.
         * @param {string} propertyName                         - Name of desired property.
         * @param {T} defaultValue                              - Default value of desired property.
         */
            export function getCategoricalObjectValue<T>(category: DataViewCategoryColumn, index: number, objectName: string, propertyName: string, defaultValue: T): T {
                let categoryObjects = category.objects;

                if (categoryObjects) {
                    let categoryObject: DataViewObject = categoryObjects[index];
                    if (categoryObject) {
                        let object = categoryObject[objectName];
                        if (object) {
                            let property: T = <T>object[propertyName];
                            if (property !== undefined) {
                                return property;
                            }
                        }
                    }
                }
                return defaultValue;
            }

        /**
         * Render SVG line and area for a given violin series
         * 
         * @param seriesContainer                               - The element to apply the SVG rendering to
         * @param viewModel                                     - The view model object to use
         * @param settings                                      - Visual settings
         * @param side                                          - The side to render the plot on (we need two plots per series for a violin)
         */
            function renderViolinLine(seriesContainer: d3.Selection<ViolinPlotModels.ICategory>, viewModel: IViewModel, settings: VisualSettings, side: EViolinSide) {
                
                /** Add the violin side container */
                    let violinContainer = seriesContainer.append('g')
                        .classed({
                            'violinPlotViolin': true
                        })
                        .classed(`${EViolinSide[side]}`, true)
                        .attr({
                            'transform': `rotate(90, 0, 0) translate(0, -${viewModel.xAxis.scale.rangeBand() / 2}) ${side == EViolinSide.right ? 'scale(1, -1)' : ''}`,
                            'shape-rendering': 'geometricPrecision'
                        });

                /** Area - no point bothering if we're fully transparent */
                    if (settings.dataColours.transparency != 100) {
                        violinContainer.append('path')
                            .classed('violinPlotViolinArea', true)
                            .attr('d', d => d.areaGen(d.dataKde))
                            .style({
                                'fill': d => d.colour,
                                'fill-opacity': 1 - (settings.dataColours.transparency / 100),
                                'stroke-width': 0
                            });
                    }

                /** Line  */
                    violinContainer.append('path')
                        .classed('violinPlotViolinLine', true)
                        .attr('d', d => d.lineGen(d.dataKde))
                        .style({
                            'fill': 'none',
                            'stroke': d => d.colour,
                            'stroke-width': `${settings.violin.strokeWidth}px`,
                            'stroke-linecap': (!settings.violin.clamp)
                                ?   'round'
                                :   'butt'
                        });

            }

        /**
         * Handle rendering of the violin based on the selected type
         * 
         * @param seriesContainer                               - The element to apply the SVG rendering to
         * @param viewModel                                     - The view model object to use
         * @param settings                                      - Visual settings
         */
            export function renderViolin(seriesContainer: d3.Selection<ViolinPlotModels.ICategory>, viewModel: IViewModel, settings: VisualSettings) {

                if (settings.violin.type == 'line') {

                    renderViolinLine(seriesContainer, viewModel, settings, EViolinSide.left);
                    renderViolinLine(seriesContainer, viewModel, settings, EViolinSide.right);

                }

            }

        /**
         * Handle rendering of a box plot whisker. Will render for the specified range.
         * For top, this will run from `quartile 3` to `95%`;
         * For bottom, this will run from `5%` to `quartile 1`
         * 
         * @param seriesContainer                               - The element to apply the SVG rendering to
         * @param viewModel                                     - The view model object to use
         * @param settings                                      - Visual settings
         * @param whisker                                       - The whisker to render 
         */
            function renderBoxPlotWhisker(boxPlotContainer: d3.Selection<ViolinPlotModels.ICategory>, viewModel: IViewModel, settings: VisualSettings, whisker: EBoxPlotWhisker) {

                boxPlotContainer.append('line')
                    .classed({
                        'violinPlotBoxPlot': true,
                        'whisker': true
                    })
                    .classed('range', true)
                    .attr({
                        'x1': (viewModel.xAxis.scale.rangeBand() / 2),
                        'x2': (viewModel.xAxis.scale.rangeBand() / 2),
                        'y1': (d) => viewModel.yAxis.scale(
                            whisker == EBoxPlotWhisker.bottom
                                ?   d.statistics.confidenceLower
                                :   d.statistics.confidenceUpper
                        ),
                        'y2': (d) => viewModel.yAxis.scale(
                            whisker == EBoxPlotWhisker.bottom
                                ?   d.statistics.quartile1
                                :   d.statistics.quartile3
                        ),
                        'stroke-width': `${settings.dataPoints.strokeWidth}px`,
                        'stroke': `${settings.dataPoints.boxFillColour}`
                    });

            }

            export function renderBarcodePlot(seriesContainer: d3.Selection<ViolinPlotModels.ICategory>, viewModel: IViewModel, settings: VisualSettings) {

                if (viewModel.barcodePlot.width > settings.dataPoints.strokeWidth) {

                    /** Add the container */
                        let barcodeContainer = seriesContainer
                            .append('g')
                                .classed('violinPlotBarcodeContainer', true)
                                .attr({
                                    'shape-rendering': 'geometricPrecision'
                                });

                        barcodeContainer.selectAll('.barcodeDataPoint')
                            .data(d => d.dataPoints)
                            .enter()
                            .append('g')
                                .classed('barcodeDataPoint', true);

                }

            }

        /**
         * Handle rendering of box plot
         * 
         * @param seriesContainer                               - Container to apply the box plot to
         * @param viewModel                                     - View model to use when calculating
         * @param settings                                      - Visual settings
         */
            export function renderBoxPlot(seriesContainer: d3.Selection<ViolinPlotModels.ICategory>, viewModel: IViewModel, settings: VisualSettings) {

                if (viewModel.boxPlot.width > settings.dataPoints.strokeWidth) {

                    /** Add the box */
                        let boxContainer = seriesContainer
                            .append('g')
                            .attr({
                                'shape-rendering': 'geometricPrecision'
                            });

                        boxContainer.append('rect')
                            .classed({
                                'violinPlotBoxPlot': true,
                                'box': true
                            })
                            .attr({
                                'x': viewModel.boxPlot.xLeft,
                                'y': (d) => viewModel.yAxis.scale(d.statistics.quartile3),
                                'width': viewModel.boxPlot.width,
                                'height': (d) => -viewModel.yAxis.scale(d.statistics.quartile3) + viewModel.yAxis.scale(d.statistics.quartile1),
                                'stroke': `${settings.dataPoints.boxFillColour}`,
                                'stroke-width': `${settings.dataPoints.strokeWidth}px`,
                                'fill': `${settings.dataPoints.boxFillColour}`,
                                'fill-opacity': 1 - (settings.dataPoints.transparency / 100)
                            });

                    /** Do the whiskers, if we need them */
                        if (settings.dataPoints.showWhiskers) {
                            renderBoxPlotWhisker(boxContainer, viewModel, settings, EBoxPlotWhisker.bottom);
                            renderBoxPlotWhisker(boxContainer, viewModel, settings, EBoxPlotWhisker.top);
                        }

                    /** Mean and median */
                        if (settings.dataPoints.showMedian){
                            boxContainer.append('line')
                            .classed({
                                'violinPlotBoxPlot': true,
                                'median': true
                            })
                            .attr({
                                'x1': viewModel.boxPlot.xLeft + (settings.dataPoints.strokeWidth / 2),
                                'x2': viewModel.boxPlot.xRight - (settings.dataPoints.strokeWidth / 2),
                                'y1': (d) => viewModel.yAxis.scale(d.statistics.median),
                                'y2': (d) => viewModel.yAxis.scale(d.statistics.median),
                                'stroke': `${settings.dataPoints.medianFillColour}`,
                                'stroke-width': `${settings.dataPoints.strokeWidth}px`,
                            });
                        }

                        if (settings.dataPoints.showMean && viewModel.boxPlot.width > viewModel.boxPlot.actualMeanDiameter) {
                            boxContainer.append('circle')
                                .classed({
                                    'violinPlotBoxPlot': true,
                                    'mean': true,
                                    'outer': true
                                })
                                .attr({
                                    'cx': (viewModel.xAxis.scale.rangeBand() / 2),
                                    'cy': (d) => viewModel.yAxis.scale(d.statistics.mean),
                                    'r': /** Don't render if larger than the box height */
                                        (d)=> -(viewModel.yAxis.scale(d.statistics.quartile3) - viewModel.yAxis.scale(d.statistics.quartile1)) < viewModel.boxPlot.actualMeanDiameter
                                            ?   0
                                            :   viewModel.boxPlot.actualMeanRadius
                                })
                                .style({
                                    'fill': settings.dataPoints.meanFillColourInner,
                                    'stroke': settings.dataPoints.meanFillColour,
                                    'stroke-width': `${settings.dataPoints.strokeWidth}px`
                                });
                        }

                }

            }

        /**
         * Display usage information within the viewport
         * 
         * @param containingElement                             - The element to attach the message to
         */
            export function visualUsage(containingElement: d3.Selection<{}>, host: IVisualHost, settings: VisualSettings) {
                let container = containingElement
                    .append('div')
                        .classed('card', true)
                        .classed('border-0', true)
                    .append('div')
                        .classed('card-body', true);
                container
                    .append('h5')
                        .classed('card-title', true)
                        .html('Usage');
                container     
                    .append('p')
                        .classed('card-text', true)
                        .html('Please ensure that you have added data to the <strong>Sampling</strong>\
                            and <strong>Measure Data</strong> fields &#128522;');
                container
                    .append('p')
                        .classed('card-text', true)
                        .html('You can also supply an optional <strong>Category</strong> to plot multiple \
                            violins within your data set.');
                let usageLink = container
                    .append('a')
                        .attr('href', '#')
                        .attr('role', 'button')
                        .classed('btn', true)
                        .classed('btn-outline-info', true)
                        .classed('btn-sm', true)
                        .html('Detailed Help (External Site)');
                usageLink.on('click', () => {
                    host.launchUrl(settings.about.usageUrl);
                })
            }

        /**
         * Display 'collapsed' state of the visual
         * 
         * @param containingElement                              - The element to attach the message to
         */
            export function visualCollapsed(containingElement: d3.Selection<{}>) {
                containingElement
                    .append('div')
                        .classed('container', true)
                        .html('&nbsp;');
            }

    }
}