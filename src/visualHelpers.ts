module powerbi.extensibility.visual {

    export module ViolinPlotHelpers {

        import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
        import axisHelper = powerbi.extensibility.utils.chart.axis;
        import IViewModel = ViolinPlotModels.IViewModel;
        import ICategory = ViolinPlotModels.ICategory;
        import IStatistics = ViolinPlotModels.IStatistics;
        import IDataPointKde = ViolinPlotModels.IDataPointKde;

        /** Kernel density estimator - used to produce smoother estimate than a histogram */
        function kernelDensityEstimator(kernel, x) {
            return function (sample) {
                return x.map(function (x) {
                    return {
                        x: x, 
                        y: d3.mean(sample, function (v:number) {return kernel(x - v);})
                    };
                });
            };
        }

        function eKernel(scale) {
            return function (u) {
                return Math.abs(u /= scale) <= 1 ? .75 * (1 - u * u) / scale : 0;
            };
        }

        export function visualTransform(options: VisualUpdateOptions, /** settings: VisualSettings */) : IViewModel {

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
                    return viewModel;
                }

            /** Otherwise, let's get that data! */
                let values = dataViews[0].categorical.values,
                    allDataPoints: number[] = [],
                    metadata = dataViews[0].metadata,
                    categoryMetadata = metadata.columns.filter(c => c.roles['category'])[0],
                    measureMetadata = metadata.columns.filter(c => c.roles['measure'])[0];

                /** TODO: Remove this with a suitable calculation of the axis height and width */
                let xAxisHeight = 30; 
                let yAxisWidth = 50;
                let boxPlotWidth = 15; /** TODO: We'll size this based on series */

                /** Assign categorical data and statistics */
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

                /** Add Y-axis properties */
                    let formatStringProp: powerbi.DataViewObjectPropertyIdentifier = {
                        objectName: 'general',
                        propertyName: 'formatString',
                    };
                    viewModel.yAxis = axisHelper.createAxis({
                        pixelSpan: options.viewport.height - xAxisHeight,
                        dataDomain: [viewModel.statistics.min, viewModel.statistics.max],
                        metaDataColumn: measureMetadata,
                        formatString: valueFormatter.getFormatString(measureMetadata, formatStringProp),
                        outerPadding: 10, /** TODO: Probably font size-based to keep things nice */
                        isScalar: true,
                        isVertical: true,
                    });
                    viewModel.yAxis.axis.orient('left');
                    viewModel.yAxis.axis.tickSize(-options.viewport.width + yAxisWidth);

                /** Add vertical X-axis properties */
                    viewModel.xVaxis = viewModel.yAxis;

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