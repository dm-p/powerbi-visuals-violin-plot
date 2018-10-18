module powerbi.extensibility.visual {

    export module ViolinPlotHelpers {

        import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
        import axisHelper = powerbi.extensibility.utils.chart.axis;
        import PixelConverter = powerbi.extensibility.utils.type.PixelConverter;
        import textMeasurementService = powerbi.extensibility.utils.formatting.textMeasurementService;

        /** Internal view models */
            import IViewModel = ViolinPlotModels.IViewModel;
            import ICategory = ViolinPlotModels.ICategory;
            import IStatistics = ViolinPlotModels.IStatistics;
            import IDataPointKde = ViolinPlotModels.IDataPointKde;
            import IAxis = ViolinPlotModels.IAxis;

        /** Kernel density estimator - used to produce smoother estimate than a histogram */
        function kernelDensityEstimator(kernel, x) {
            return function (sample) {
                return x.map(function (x) {
                    return {
                        x: x, 
                        y: d3.mean(sample, (v:number) => kernel(x - v))
                    };
                });
            };
        }

        function eKernel(scale) {
            return function (u) {
                return Math.abs(u /= scale) <= 1 ? .75 * (1 - u * u) / scale : 0;
            };
            
        }

        export class VisualDebugger {
            enabled: boolean = false;
            constructor(condition: boolean) {
                this.enabled = condition;
            }

            clear() {
                if (this.enabled) {
                    console.clear();
                }
            }

            heading(heading: string) {
                if (this.enabled) {
                    console.log(`\n====================\n${heading}\n====================`);
                }
            }

            footer() {
                if (this.enabled) {
                    console.log(`====================`);
                }
            }

            log(...args: any[]) {
                if (this.enabled) {
                    console.log('|\t', ...args);
                }
            }
        }

        export function visualTransform(options: VisualUpdateOptions, settings: VisualSettings) : IViewModel {

            /** Set up debugging */
                let debug = new VisualDebugger(settings.about.debugMode && settings.about.debugVisualUpdate);
                debug.log('Running Visual Transform...');

            let dataViews = options.dataViews;

            /** Create bare-minimum view model */
                let viewModel = {} as IViewModel;

            /** Return this bare-minimum model if the conditions for our data view are not satisfied (basically don't draw the chart) */
                if (!dataViews
                    || !dataViews[0]
                    || !dataViews[0].categorical
                    || !dataViews[0].categorical.categories[0].source
                    || !dataViews[0].categorical.values
                    || !dataViews[0].metadata
                ) {
                    debug.log('Data mapping conditions not met. Returning bare-minimum view model.');
                    return viewModel;
                }

            /** Otherwise, let's get that data! */
                debug.log('Data mapping conditions met. Proceeding with view model transform.');
                let values = dataViews[0].categorical.values,
                    allDataPoints: number[] = [],
                    metadata = dataViews[0].metadata,
                    categoryMetadata = metadata.columns.filter(c => c.roles['category'])[0],
                    measureMetadata = metadata.columns.filter(c => c.roles['measure'])[0];

                /** TODO: Remove this with a suitable calculation of the axis height and width */
                let xAxisHeight = 30;
                let boxPlotWidth = 15; /** TODO: We'll size this based on series */

                /** Assign categorical data and statistics */
                /** TODO: Manage mapping when no category values are supplied (single violin based on all values) */
                    viewModel.categories = values
                        .map(c => {
                            let dataPoints = c.values
                                .filter(v => v !== null)
                                .map(v => Number(v))
                                .sort(d3.ascending);

                            /** Send to our combined array for stats generation outside all series */
                                allDataPoints = allDataPoints.concat(dataPoints);

                            return {                    
                                name: valueFormatter.format(c.source.groupName, categoryMetadata.format),
                                dataPoints: dataPoints,
                                statistics: {
                                    min: d3.min(dataPoints),
                                    confidenceLower: d3.quantile(dataPoints, 0.05),
                                    quartile1: d3.quantile(dataPoints, 0.25),
                                    median: d3.median(dataPoints),
                                    mean: d3.mean(dataPoints),
                                    quartile3: d3.quantile(dataPoints, 0.75),
                                    confidenceUpper: d3.quantile(dataPoints, 0.95),
                                    max: d3.max(dataPoints)
                                }
                            } as ICategory;
                        });

                /** We should have all raw data, so we can do overall stats on them for the chart */
                    allDataPoints.sort(d3.ascending);
                    viewModel.statistics = {
                        min: d3.min(allDataPoints),
                        max: d3.max(allDataPoints)
                    } as IStatistics;

                /** Add axis properties */
                    let formatStringProp: powerbi.DataViewObjectPropertyIdentifier = {
                        objectName: 'general',
                        propertyName: 'formatString',
                    };

                    /** Y-axis */
                        let yAxis = {
                            padding: {
                                left: 5
                            },
                            labelTextProperties: {
                                fontFamily: settings.yAxis.fontFamily,
                                fontSize: PixelConverter.toString(settings.yAxis.fontSize)
                            },
                            titleTextProperties: {
                                text: function() {            
                                    /** If we supplied a title, use that, otherwise format our measure names */
                                        let title = (!settings.yAxis.titleText) 
                                            ? measureMetadata.displayName
                                            : settings.yAxis.titleText;
                
                                    /** Return the correct title based on our supplied settings */
                                        if (settings.yAxis.labelDisplayUnits == 1) {
                                            return title;
                                        }
                                        switch (settings.yAxis.titleStyle) {
                                            case 'title': {
                                                return title;
                                            }
                                            case 'unit': {
                                                return yFormat.displayUnit.title;
                                            }
                                            case 'both': {
                                                return `${title}`;// (${layout.yAxis.numberFormat.displayUnit.title})`;
                                            }
                                        }
                                }(),
                                fontFamily: settings.yAxis.titleFontFamily,
                                fontSize:PixelConverter.toString(settings.yAxis.titleFontSize)
                            },
                            axisProperties: axisHelper.createAxis({
                                pixelSpan: options.viewport.height, /** TODO: manage categorical axis */
                                dataDomain: [
                                    settings.yAxis.start !== null
                                        ?   settings.yAxis.start 
                                        :   viewModel.statistics.min, 
                                    settings.yAxis.end !== null
                                        ?   settings.yAxis.end
                                        :   viewModel.statistics.max
                                ],
                                metaDataColumn: measureMetadata,
                                formatString: valueFormatter.getFormatString(measureMetadata, formatStringProp),
                                outerPadding: settings.yAxis.fontSize / 2,
                                isScalar: true,
                                isVertical: true,
                            })
                        } as IAxis;

                        /** Resolve the title dimensions */
                            yAxis.titleDimensions = {
                                width: (settings.yAxis.show && settings.yAxis.showTitle)
                                    ?   textMeasurementService.measureSvgTextHeight(
                                            yAxis.titleTextProperties /** TODO make sure text gets set in the properties above when we figure it out */
                                        )
                                    :   0,
                                height: options.viewport.height, /** TODO: manage categorical axis */
                                x: -options.viewport.height / 2, /** TODO: manage categorical axis */
                                y: 0
                            };

                        /** Find the widest label and use that for our Y-axis width overall */
                            yAxis.labelWidth = settings.yAxis.show && settings.yAxis.showLabels
                                ?   Math.max(
                                        textMeasurementService.measureSvgTextWidth(yAxis.labelTextProperties, yAxis.axisProperties.values[0]),
                                        textMeasurementService.measureSvgTextWidth(yAxis.labelTextProperties, yAxis.axisProperties.values[yAxis.axisProperties.values.length - 1])
                                    )
                                    + yAxis.padding.left
                                : 0;

                        /** Solve the axis dimensions */
                            yAxis.axisDimensions = {
                                height: options.viewport.height, /** TODO: manage categorical axis */
                                width: yAxis.labelWidth + yAxis.titleDimensions.width,
                                x: yAxis.titleDimensions.width
                            };

                        /** Revise Y-axis properties as necessary */
                            yAxis.axisProperties.axis.orient('left');
                            yAxis.axisProperties.axis.tickSize(-options.viewport.width + yAxis.axisDimensions.width);

                        viewModel.yAxis = yAxis;

                /** Add vertical X-axis properties */
                    viewModel.xVaxis = viewModel.yAxis.axisProperties;

                /** Do Kernel Density Estimator on the vertical X-axis 
                 *  TODO: optimal (or configurable resolution/bandwidth) */
                    let resolution = 100,
                        bandwidth = 20,
                        kde = kernelDensityEstimator(eKernel(bandwidth), viewModel.xVaxis.scale.ticks(resolution));

                    /** Map out KDE for each series (TODO we might be able to do this in-line when we refactor the data mapping) */
                        viewModel.categories.map(v => {
                            v.dataKde = kde(v.dataPoints)
                                /** TODO: this clamps to the data but can look ugly we should offer the option to smooth out the data to a converged point if so desired */
                                .filter(d => !v.statistics.min || d.x >= v.statistics.min)
                                .filter(d => !v.statistics.max || d.x <= v.statistics.max)

                            v.yVScale = d3.scale.linear()
                                .range([0, boxPlotWidth * 2])
                                .domain([0, d3.max<IDataPointKde>(v.dataKde, d => d.y)])
                                .clamp(true);

                            /** Now we have our scaling, we can generate the line function for each series */
                                v.lineGen = d3.svg.line<IDataPointKde>()
                                    .interpolate('basis') /** TODO: configurable interpolation (sensible ones) */
                                    .x(d => viewModel.xVaxis.scale(d.x))
                                    .y(d => v.yVScale(d.y));
                        });

            return viewModel;

        }

    }
}