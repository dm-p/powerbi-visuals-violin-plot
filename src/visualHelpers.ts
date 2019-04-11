module powerbi.extensibility.visual {

    export module ViolinPlotHelpers {

        /** Internal view models */
            import IViewModel = ViolinPlotModels.IViewModel;
            import ICategory = ViolinPlotModels.ICategory;
            import IVisualDataPoint = ViolinPlotModels.IVisualDataPoint;
            import IDataPointAggregate = ViolinPlotModels.IDataPointAggregate;
            import IAxisLinear = ViolinPlotModels.IAxisLinear;
            import EViolinSide = ViolinPlotModels.EViolinSide;
            import EBoxPlotWhisker = ViolinPlotModels.EBoxPlotWhisker;
            import EComboPlotType = ViolinPlotModels.EComboPlotType;
            import EFeatureLineType = ViolinPlotModels.EFeatureLineType;

        /** powerbi.extensibility.utils.formatting */
            import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;

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
                        .datum(d => d)
                        .classed(`${EViolinSide[side]}`, true)
                        .attr({
                            'transform': `rotate(90, 0, 0) translate(0, -${viewModel.xAxis.scale.rangeBand() / 2}) ${side == EViolinSide.right ? 'scale(1, -1)' : ''}`,
                            'shape-rendering': 'geometricPrecision'
                        });

                /** Area - no point bothering if we're fully transparent */
                    if (settings.dataColours.transparency != 100) {
                        violinContainer.append('path')
                            .classed('violinPlotViolinPlot', true)
                            .classed('area', true)
                            .attr('d', d => d.areaGen(d.dataKde))
                            .style({
                                'fill': d => d.colour,
                                'fill-opacity': 1 - (settings.dataColours.transparency / 100),
                                'stroke-width': 0
                            });
                    }

                /** Line  */
                    violinContainer.append('path')
                        .classed('violinPlotViolinPlot', true)
                        .classed('line', true)
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

        /**
         * Handle rendering of barcode plot, which will plot a fixed-width horizontal line for each data point in the category
         * 
         * @param seriesContainer                               - Container to apply the box plot to
         * @param viewModel                                     - View model to use when calculating
         * @param settings                                      - Visual settings
         */
            export function renderLinePlot(seriesContainer: d3.Selection<ViolinPlotModels.ICategory>, viewModel: IViewModel, settings: VisualSettings, comboPlotType: EComboPlotType) {

                /** Whether we can render the chart is going to depend on how it looks, so we'll manage this with a flag before we get into it. We'll also set other
                 *  things we'll need later on here.
                 */
                    let canRender: boolean,
                        xLeft: number,
                        xRight: number,
                        featureXLeft: number,
                        featureXRight: number;

                    switch (comboPlotType) {

                        case EComboPlotType.barcodePlot: {
                            canRender = viewModel.barcodePlot.width > settings.dataPoints.strokeWidth,
                            xLeft = viewModel.barcodePlot.xLeft,
                            xRight = viewModel.barcodePlot.xRight,
                            featureXLeft = viewModel.barcodePlot.featureXLeft,
                            featureXRight = viewModel.barcodePlot.featureXRight;
                            break;
                        }

                    }

                if (canRender) {

                    /** Add the container */
                        let comboPlotContainer = seriesContainer
                            .append('g')
                                .classed('violinPlotComboLinePlotContainer', true)
                                .attr({
                                    'shape-rendering': 'geometricPrecision'
                                });

                    /** Add overlay for interactivity - the shape of thisis going to depend on the plot */
                        let overlay = seriesContainer
                            .append('rect')
                                .classed('violinPlotComboPlotOverlay', true)
                                .attr({
                                    width: viewModel[`${EComboPlotType[comboPlotType]}`].width,
                                    /** We adjust by the stroke width to ensure that the overlay covers all rendering of the data points (if we
                                     *  hover over an element that isn't bound to an ICategory then we can't display the tooltip properly) 
                                     */
                                    height: (d) => -(viewModel.yAxis.scale(d.statistics.interpolateMax) - viewModel.yAxis.scale(d.statistics.interpolateMin))
                                        +   (settings.dataPoints.strokeWidth * 2),
                                    x: xLeft,
                                    y: (d) => viewModel.yAxis.scale(d.statistics.interpolateMax) - (settings.dataPoints.strokeWidth)
                                });

                    /** Line used to represent highlighted data point. Will be moved/hidden on mouse events */
                        comboPlotContainer
                            .append('line')
                                .classed('comboPlotToolipDataPoint', true)
                                .attr({
                                    'stroke-width': 5,
                                    'stroke-opacity': 1,
                                    stroke: settings.dataPoints.barColour,
                                    x1: (d) => {
                                            switch (comboPlotType) {
                                                case (EComboPlotType.barcodePlot): {
                                                    return featureXLeft;
                                                }
                                            }
                                        },
                                    x2: (d) => {
                                            switch (comboPlotType) {
                                                case (EComboPlotType.barcodePlot): {
                                                    return featureXRight;
                                                }
                                            }
                                        },
                                    y1: 0,
                                    y2: 0
                                })
                                .style('display', 'none');

                    /** Handle dimming of data points on hover and full opacity on exit */
                        overlay.on('mouseover', (d) => {
                            d3.selectAll('.tooltipDataPoint')
                                .attr('stroke-opacity', 0.25);
                        });
                        overlay.on('mouseout', function(d) {
                            d3.selectAll('.tooltipDataPoint')
                                .attr('stroke-opacity', 1);
                            d3.select(this.parentNode)
                                .select('.comboPlotToolipDataPoint')
                                    .style('display', 'none');
                        });

                    /** Plot data points */
                        comboPlotContainer.selectAll('.tooltipDataPoint')
                            .data((d, i) => <IVisualDataPoint[]>d.dataPointsAgg.map(dp => 
                                ({
                                    value: dp.key,
                                    count: dp.count,
                                    categoryIndex: i
                                })
                            ))
                            .enter()
                            .append('line')
                                .classed('tooltipDataPoint', true)
                                .attr({
                                    'x1': (d) => {
                                            switch (comboPlotType) {
                                                case (EComboPlotType.barcodePlot): {
                                                    return xLeft;
                                                }
                                            }
                                        },
                                    'x2': (d) => {
                                            switch (comboPlotType) {
                                                case (EComboPlotType.barcodePlot): {
                                                    return xRight;
                                                }
                                            }
                                        },
                                    'y1': (d) => viewModel.yAxis.scale(d.value),
                                    'y2': (d) => viewModel.yAxis.scale(d.value),
                                    'stroke': `${settings.dataPoints.barColour}`,
                                    'stroke-width': `${settings.dataPoints.strokeWidth}px`,
                                    'stroke-linecap': 'butt'
                                });

                    /** Add quartile, mean and median features as appropriate */
                        if (settings.dataPoints.showMedian) {
                            renderFeatureLine(comboPlotContainer, viewModel, settings, EFeatureLineType.median, comboPlotType);
                        }
                        if (settings.dataPoints.showQuartiles) {
                            renderFeatureLine(comboPlotContainer, viewModel, settings, EFeatureLineType.quartile1, comboPlotType);
                            renderFeatureLine(comboPlotContainer, viewModel, settings, EFeatureLineType.quartile3, comboPlotType);
                        }
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
                            renderFeatureLine(boxContainer, viewModel, settings, EFeatureLineType.median, EComboPlotType.boxPlot);
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
                                    'stroke-width': `${settings.dataPoints.meanStrokeWidth}px`
                                });
                        }

                }

            }

        /**
         * Render a 'feature' line, i.e. a non-standard data point. Currently supports median and 1st/3rd quartiles based on the `EFeatureLineType` enum
         * 
         * @param containingElement                             - The element to attach the message to
         * @param viewModel                                     - View model containing data and other required properties
         * @param settings                                      - Visual settings
         * @param lineType                                      - The line type to render
         * @param comboPlotType                                 - Combination plot type to render line against (used to retrieve specific settings and view model properties)
         */
            export function renderFeatureLine(containingElement: d3.Selection<ICategory>, viewModel: IViewModel, settings: VisualSettings, lineType: EFeatureLineType, comboPlotType: EComboPlotType) {
                let featureXLeft: number = viewModel[`${EComboPlotType[comboPlotType]}`].featureXLeft,
                    featureXRight: number = viewModel[`${EComboPlotType[comboPlotType]}`].featureXRight;                
                
                containingElement.append('line')
                    .classed('violinPlotComboPlotFeatureLine', true)
                    .classed(`${EFeatureLineType[lineType]}`, true)
                    .classed(`${settings.dataPoints[`${EFeatureLineType[lineType]}StrokeLineStyle`]}`, true)
                    .attr({
                        'x1': featureXLeft,
                        'x2': featureXRight,
                        'y1': (d) => viewModel.yAxis.scale(d.statistics[`${EFeatureLineType[lineType]}`]),
                        'y2': (d) => viewModel.yAxis.scale(d.statistics[`${EFeatureLineType[lineType]}`]),
                        'stroke': `${settings.dataPoints[`${EFeatureLineType[lineType]}FillColour`]}`,
                        'stroke-width': `${settings.dataPoints[`${EFeatureLineType[lineType]}StrokeWidth`]}px`,
                    });

            }

        /**
         * Display usage information within the viewport
         * 
         * @param containingElement                             - The element to attach the message to
         * @param host                                          - The visual host
         * @param settings                                      - Current visual instance settings
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
                });
            }

        /**
         * Display additional information to the end-user when loading more data from the data model.
         * 
         * @param rowCount                                      - Total number of rows currently loaded
         * @param containingElement                             - The element to attach the message to
         * @param settings                                      - Current visual instance settings
         */
            export function dataLimitLoadingStatus(rowCount: number, containingElement: d3.Selection<{}>, settings: VisualSettings) {
                let rowCountFormatter = valueFormatter.create({
                    format: '#,##0'
                });
                let container = containingElement
                    .append('div');

                let progressIndicator = container
                    .append('div');
                progressIndicator
                    .append('span')
                        .classed('spinner-grow', true)
                        .classed('float-right', true);
                progressIndicator
                    .append('span')
                        .html(`Loading more data: <strong>${rowCountFormatter.format(rowCount)}</strong> rows loaded so far...`)
                        .classed('align-middle', true);

                if (settings.dataLimit.showCustomVisualNotes) {
                    container
                        .append('hr');
                    container
                        .append('h5')
                            .text('About Loading More Data');
                    container
                        .append('p')
                            .html('Custom visuals have a limit of 30,000 rows. Recent changes allow us to exceed this by loading  more data from the data model \
                                    until until Power BI\'s memory allocation limit for the visual is reached.<br/><br/>\
                                   This can be costly and will run for every update to your visual.<br/><br/>\
                                   If you are making changes to your visual layout then it is recommended that you turn off <strong>Override Row Limit</strong> \
                                    in in the <strong>Data Limit Options</strong> pane while doing so, and then enabling it when finished.<br/><br/>\
                                   You can turn off the <strong>Show Data Loading Notes</strong> property to hide these notes for end-users.');
                }
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

        /**
         * Use the mouse position to determine the nearest data point on the y-axis
         * 
         * @param overlay                                       - The overlay element to track
         * @param mouse                                         - Number array of corodinate data
         * @param yAxis                                         - Axis object to use for scaling
         */
            export function getHighlightedDataPoints(overlay: d3.Selection<ICategory>, mouse: number[], yAxis: IAxisLinear): IDataPointAggregate {
                let yData = yAxis.scale.invert(mouse[1]),
                    bisectValue = d3.bisector((d:IDataPointAggregate) => d.key).left,
                    ttv: IDataPointAggregate;

                overlay.each((d, i) => {
                    let data = d.dataPointsAgg,
                        idx = bisectValue(data, yData.toString(), 1),
                        d0 = data[idx - 1],
                        d1 = data[idx] ? data[idx] : d0;
                    ttv = yData - Number(d0.key) > Number(d1.key) - yData ? d1: d0;
                });              
                return ttv;
            }

        /**
         *  Return a formatted `VisualTooltipDataItem` based on the supplied parameters
         * 
         *  @param displayName      - Display name to apply to tooltip data point
         *  @param measureFormat    - The format string to apply to the value
         *  @param value            - The value to format
         *  @param displayUnits     - Display units to apply to the value
         *  @param precision        - Precision (decimal places) to apply to the value
         *  @param locale           - Regional settings to apply to the number format
         */
            export function formatTooltipValue(
                displayName: string, 
                measureFormat: string, 
                value: number, 
                displayUnits: number, 
                precision: number,
                locale: string
            ) : VisualTooltipDataItem {
                let formatter = valueFormatter.create({
                    format: measureFormat,
                    value: displayUnits == 0
                        ?   value
                        :   displayUnits,
                        precision: precision != null
                        ?   precision
                        :   null,
                    cultureSelector: locale
                });
                return {
                    displayName: displayName,
                    value: formatter.format(value)
                }
            }

    }
}