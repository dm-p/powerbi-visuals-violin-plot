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
            import IAxisLinear = ViolinPlotModels.IAxisLinear;
            import IAxisCategorical = ViolinPlotModels.IAxisCategorical;

        /** KDE helpers */
            import IKernel = KDE.IKernel;
            import kernelDensityEstimator = KDE.kernelDensityEstimator;      

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

                /** Determine if we don't have catergory names; can be used to drive the behaviour of the x-axis and y-axis height */
                    viewModel.categoryNames = values[0].source.groupName
                        ?   true
                        :   false;

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
                                name: viewModel.categoryNames
                                    ?   valueFormatter.format(c.source.groupName, categoryMetadata.format)
                                    :   null,
                                dataPoints: dataPoints,
                                statistics: {
                                    min: d3.min(dataPoints),
                                    confidenceLower: d3.quantile(dataPoints, 0.05),
                                    quartile1: d3.quantile(dataPoints, 0.25),
                                    median: d3.median(dataPoints),
                                    mean: d3.mean(dataPoints),
                                    quartile3: d3.quantile(dataPoints, 0.75),
                                    confidenceUpper: d3.quantile(dataPoints, 0.95),
                                    max: d3.max(dataPoints),
                                    deviation: d3.deviation(dataPoints),
                                    iqr: d3.quantile(dataPoints, 0.75) - d3.quantile(dataPoints, 0.25),
                                    span: d3.max(dataPoints) - d3.min(dataPoints)
                                }
                            } as ICategory;
                        });

                /** We should have all raw data, so we can do overall stats on them for the chart */
                    allDataPoints.sort(d3.ascending);
                    viewModel.statistics = {
                        min: d3.min(allDataPoints),
                        max: d3.max(allDataPoints),
                        deviation: d3.deviation(allDataPoints),
                        iqr: d3.quantile(allDataPoints, 0.75) - d3.quantile(allDataPoints, 0.25),
                        span: d3.max(allDataPoints) - d3.min(allDataPoints)
                    } as IStatistics;

                /** Derive bandwidth based on Silverman's rule-of-thumb. We'll do this across all data points for now,
                 *  as it produces some very different ranges for individual series (which kind of makes sense when you're looking
                 *  at potentially different sub-ranges of data in groups). Also, if we wish to apply a manual override for bandwidth,
                 *  then the custom viz framework doesn't let us tailor this per series very easily.
                 * 
                 *  Sources: 
                 *      - https://core.ac.uk/download/pdf/6591111.pdf
                 *      - https://www.bauer.uh.edu/rsusmel/phd/ec1-26.pdf
                 *      - https://en.wikipedia.org/wiki/Kernel_density_estimation#A_rule-of-thumb_bandwidth_estimator
                 *      - https://stats.stackexchange.com/a/6671
                 *      - https://www.ssc.wisc.edu/~bhansen/718/NonParametrics1.pdf
                */
                    let kernel = {} as IKernel;
                    if (settings.violin.type == 'line') {
                    
                        /** Sigma function to account for outliers */
                            let bwSigma = Math.min(viewModel.statistics.deviation, viewModel.statistics.iqr / 1.349);
                            
                        /** Allocate the selected kernel from the properties pane */
                            debug.log(`Using ${settings.violin.kernel} kernel`);
                            kernel = KDE.kernels[settings.violin.kernel];

                        /** Because bandwidth is subjective, we use Silverman's rule-of-thumb to try and predict the bandwidth based on the spread of data.
                            *  The use may wish to override this, so substitute for this if supplied. We'll keep the derived Silverman bandwidth for the user
                            *  to obtain from the tooltip, should they wish to 
                            */
                            viewModel.statistics.bandwidthSilverman = kernel.factor * bwSigma * Math.pow(allDataPoints.length, -1/5);
                            viewModel.statistics.bandwidthActual = settings.violin.specifyBandwidth && settings.violin.bandwidth
                                ?   settings.violin.bandwidth
                                :   viewModel.statistics.bandwidthSilverman;

                    }

                /** Add axis properties */
                    let formatStringProp: powerbi.DataViewObjectPropertyIdentifier = {
                        objectName: 'general',
                        propertyName: 'formatString',
                    };

                    /** Y-axis (initial) */
                        debug.log('Initial Y-Axis setup...');
                        let yFormat = valueFormatter.create({
                            format: measureMetadata.format,
                            value: settings.yAxis.labelDisplayUnits == 0
                                ?   viewModel.statistics.max
                                :   settings.yAxis.labelDisplayUnits,
                            precision: settings.yAxis.precision != null
                                ?   settings.yAxis.precision
                                :   null
                        });

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
                                        if (settings.yAxis.labelDisplayUnits == 1 || !yFormat.displayUnit) {
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
                                                return `${title} (${yFormat.displayUnit.title})`;
                                            }
                                        }
                                }(),
                                fontFamily: settings.yAxis.titleFontFamily,
                                fontSize:PixelConverter.toString(settings.yAxis.titleFontSize)
                            },
                            domain: [
                                viewModel.statistics.min,
                                viewModel.statistics.max
                            ]
                        } as IAxisLinear;

                    /** X-Axis (initial) */
                        debug.log('Initial X-Axis setup...');
                        let xAxis = {
                            padding: {
                                top: 5
                            },
                            labelTextProperties: {
                                fontFamily: settings.xAxis.fontFamily,
                                fontSize: PixelConverter.toString(settings.xAxis.fontSize),
                                text: viewModel.categories[0].name
                            },
                            titleTextProperties: {
                                text: !categoryMetadata 
                                    ?   ''
                                    :   (!settings.xAxis.titleText 
                                            ?   categoryMetadata.displayName
                                            :   settings.xAxis.titleText
                                        ).trim()
                                ,
                                fontFamily: settings.xAxis.titleFontFamily,
                                fontSize:PixelConverter.toString(settings.xAxis.titleFontSize)
                            },
                            domain: viewModel.categories.map(d => d.name)
                        } as IAxisCategorical;

                    /** Axis post-processing */

                        /** X-axis height */
                            debug.log('X-axis vertical space...');
                            xAxis.titleDimensions = {
                                height: settings.xAxis.show && settings.xAxis.showTitle && xAxis.titleTextProperties.text !== ''
                                    ?   textMeasurementService.measureSvgTextHeight(xAxis.titleTextProperties)
                                    :   0
                            };
                            xAxis.dimensions = {
                                height: settings.xAxis.show && viewModel.categoryNames
                                    ?   textMeasurementService.measureSvgTextHeight(xAxis.labelTextProperties)
                                        +   xAxis.titleDimensions.height
                                        +   xAxis.padding.top
                                    :   0
                            };

                        /** Figure out how much vertical space we have for the y-axis and assign what we know currently */
                            debug.log('Y-Axis vertical space...');
                            let yPadVert = settings.yAxis.fontSize / 2,
                                yHeight = options.viewport.height - yPadVert - xAxis.dimensions.height;

                            yAxis.dimensions = {
                                height: yHeight,
                                y: yPadVert /** TODO: manage categorical axis, padding etc. */
                            };

                            yAxis.range = [
                                yAxis.dimensions.height,
                                yAxis.dimensions.y
                            ];

                            debug.log('Y-Axis ticks and scale...');
                            yAxis.ticks = axisHelper.getRecommendedNumberOfTicksForYAxis(yAxis.dimensions.height);
                            yAxis.scale = d3.scale.linear()
                                .domain(yAxis.domain)
                                .range(yAxis.range)
                                .nice(yAxis.ticks);
                            yAxis.ticksFormatted = yAxis.scale.ticks().map(v => ( 
                                settings.yAxis.showLabels
                                    ?   yFormat.format(v)
                                    :   ''
                            ));

                        /** Resolve the title dimensions */
                            debug.log('Y-Axis title sizing...');
                            yAxis.titleDimensions = {
                                width: (settings.yAxis.show && settings.yAxis.showTitle && yAxis.titleTextProperties.text !== '')
                                    ?   textMeasurementService.measureSvgTextHeight(yAxis.titleTextProperties)
                                    :   0,
                                height: yHeight,
                                x: -yHeight / 2,
                                y: 0
                            };

                        /** Find the widest label and use that for our Y-axis width overall */
                            debug.log('Y-Axis label sizing...');
                            yAxis.labelWidth = settings.yAxis.show && settings.yAxis.showLabels
                                ?   Math.max(
                                        textMeasurementService.measureSvgTextWidth(yAxis.labelTextProperties, yAxis.ticksFormatted[0]),
                                        textMeasurementService.measureSvgTextWidth(yAxis.labelTextProperties, yAxis.ticksFormatted[yAxis.ticksFormatted.length - 1])
                                    )
                                    + yAxis.padding.left
                                : 0;

                        /** Solve the remaining axis dimensions */
                            yAxis.dimensions.width = yAxis.labelWidth + yAxis.titleDimensions.width;
                            yAxis.dimensions.x = yAxis.titleDimensions.width;
                            xAxis.dimensions.width = xAxis.titleDimensions.width = options.viewport.width - yAxis.dimensions.width
                            xAxis.titleDimensions.x = yAxis.dimensions.width + (xAxis.dimensions.width / 2);
                            xAxis.titleDimensions.y = options.viewport.height - xAxis.titleDimensions.height;

                        /** Revise Y-axis properties as necessary */
                            debug.log('Y-Axis generator functions...');
                            yAxis.generator = d3.svg.axis()
                                .scale(yAxis.scale)
                                .orient('left')
                                .ticks(yAxis.ticks)
                                .tickSize(-options.viewport.width + yAxis.dimensions.width)
                                .tickFormat(d => settings.yAxis.showLabels
                                    ?   yFormat.format(d)
                                    :   ''
                                );

                        /** Now we have y-axis width, do remaining x-axis width stuff */
                            debug.log('X-Axis ticks and scale...');
                            xAxis.range = [0, xAxis.dimensions.width];
                            xAxis.scale = d3.scale.ordinal()
                                .domain(xAxis.domain)
                                .rangeRoundBands(xAxis.range);
                            xAxis.generator = d3.svg.axis()
                                .scale(xAxis.scale)
                                .orient('bottom')
                                .tickSize(-yAxis.dimensions.height);

                        viewModel.yAxis = yAxis;
                        viewModel.xAxis = xAxis;

                /** Add vertical X-axis properties */
                    viewModel.xVaxis = viewModel.yAxis;

                /** Do Kernel Density Estimator on the vertical X-axis, if we want to render a line for violin */
                    if (settings.violin.type == 'line') {
                    
                        debug.log('Kernel Density Estimation...');

                        /** Map out KDE for each series (TODO we might be able to do this in-line when we refactor the data mapping) */
                            viewModel.categories.map(v => {

                                /** Through analysis, we can apply a scaling to the line based on the axis ticks, and a factor supplied by
                                 *  the resolution enum. Through some profiling with a few different sets of test data, the values in the enum
                                 *  seem to generate an array suitable enough to 'improve' the resolution of the line within the confines of the
                                 *  viewport sufficiently. There may well be a better way to do this, but it will suffice for now and makes the 
                                 *  process sufficiently straigthforward for the end-user...
                                 */
                                    let kde = kernelDensityEstimator(
                                            kernel,
                                            viewModel.statistics.bandwidthActual,
                                            viewModel.xVaxis.scale.ticks(parseInt(settings.violin.resolution))
                                        );

                                    v.dataKde = kde(v.dataPoints)
                                        /** TODO: this clamps to the data but can look ugly we should offer the option to smooth out the data to a converged point if so desired */
                                        .filter(d => !v.statistics.min || d.x >= v.statistics.min)
                                        .filter(d => !v.statistics.max || d.x <= v.statistics.max)
                                        
                                    let violinFullWidth = xAxis.scale.rangeBand() / 2;
                                    v.yVScale = d3.scale.linear()
                                        .range([
                                            0, 
                                            /** Width of x-axis adjusted for inner padding */
                                            violinFullWidth - (violinFullWidth * (settings.violin.innerPadding / 100))
                                        ])
                                        .domain([0, d3.max<IDataPointKde>(v.dataKde, d => d.y)])
                                        .clamp(true);

                                    /** Now we have our scaling, we can generate the line function for each series */
                                        v.lineGen = d3.svg.line<IDataPointKde>()
                                            .interpolate('basis') /** TODO: configurable interpolation (sensible ones) */
                                            .x(d => viewModel.xVaxis.scale(d.x))
                                            .y(d => v.yVScale(d.y));
                            });
                    }

            debug.log('View model completely mapped!');
            return viewModel;

        }

    }
}