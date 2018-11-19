module powerbi.extensibility.visual {

    export module ViolinPlotHelpers {

        import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
        import axisHelper = powerbi.extensibility.utils.chart.axis;
        import PixelConverter = powerbi.extensibility.utils.type.PixelConverter;
        import textMeasurementService = powerbi.extensibility.utils.formatting.textMeasurementService;

        /** Internal view models */
            import IViewModel = ViolinPlotModels.IViewModel;
            import ICategory = ViolinPlotModels.ICategory;
            import IViolinPlot = ViolinPlotModels.IViolinPlot;
            import IBoxPlot = ViolinPlotModels.IBoxPlot;
            import IStatistics = ViolinPlotModels.IStatistics;
            import IDataPointKde = ViolinPlotModels.IDataPointKde;
            import IAxisLinear = ViolinPlotModels.IAxisLinear;
            import IAxisCategorical = ViolinPlotModels.IAxisCategorical;
            import EViolinSide = ViolinPlotModels.EViolinSide;
            import EBoxPlotWhisker = ViolinPlotModels.EBoxPlotWhisker;

        /** KDE helpers */
            import IKernel = KDE.IKernel;
            import kernelDensityEstimator = KDE.kernelDensityEstimator;
            import kernelDensityRoot = KDE.kernelDensityRoot;
            import kernelDensityInterpolator = KDE.kernelDensityInterpolator;
            import ELimit = KDE.ELimit;

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

        /**
         * Gets property value for a particular object in a category.
         *
         * @function
         * @param {DataViewCategoryColumn} category - List of category objects.
         * @param {number} index                    - Index of category object.
         * @param {string} objectName               - Name of desired object.
         * @param {string} propertyName             - Name of desired property.
         * @param {T} defaultValue                  - Default value of desired property.
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

        export function visualCategoryStatistics(options: VisualUpdateOptions, settings: VisualSettings, host: IVisualHost, colourPalette: IColorPalette) : IViewModel  {

            /** Set up debugging */
                let debug = new VisualDebugger(settings.about.debugMode && settings.about.debugVisualUpdate);
                debug.log('Preparing categories and statistics...');

            let dataViews = options.dataViews;

            /** Create bare-minimum view model */
                let viewModel = {} as IViewModel;

            /** Return this bare-minimum model if the conditions for our data view are not satisfied (basically don't draw the chart) */
                if (!dataViews
                    || !dataViews[0]
                    || !dataViews[0].categorical
                    || !dataViews[0].categorical.values
                    || !dataViews[0].metadata
                ) {
                    debug.log('Data mapping conditions not met. Returning bare-minimum view model.');
                    return viewModel;
                }

            /** Otherwise, let's get that data! */
                debug.log('Data mapping conditions met. Proceeding with view model transform.');
                let values = dataViews[0].categorical.values,
                    category = dataViews[0].categorical.categories && dataViews[0].categorical.categories[1]
                        ?   dataViews[0].categorical.categories[1]
                        :   null,
                    metadata = dataViews[0].metadata,
                    categoryMetadata = metadata.columns.filter(c => c.roles['category'])[0],
                    measureMetadata = metadata.columns.filter(c => c.roles['measure'])[0];
                    viewModel.categories = [];

                /** Assign initial category data to view model. This will depend on whether we have a category grouping or not, so set up accordingly. 
                 *  Note that while it makes sense to put the category above the sampling from an analytical perspective, it actually creates blank values
                 *  for every unique sampling value under categories that do not contain it, and this ultimately blows up the granularity of the data
                 *  set significantly for even a few hundred rows. Byr grouping by sampling and then by category, we get the same number of rows as
                 *  there are in our base data. What this means is that we need to get the unique category values from the 'lower level' category in our
                 *  data view mapping and then assign our groupings once we know what they are.
                */

                    /** Copy our values array and sort */
                        let allDataPoints = <number[]>values[0].values
                            .slice(0)
                            .sort(d3.ascending);

                    if (!category) {
                        
                        viewModel.categoryNames = false;
                        viewModel.categories.push({
                            name: '',
                            colour: settings.dataColours.defaultFillColour,
                            selectionId: null,
                            dataPoints: allDataPoints
                        } as ICategory);

                    } else {

                        /** Get unique category values */
                            let distinctCategories = category.values.reduce(function(accum, current, idx) {
                                if (!accum.filter(c => c.category == `${current}`)[0]) {
                                    accum.push({
                                        category: current,
                                        selectionId: host.createSelectionIdBuilder()
                                            .withCategory(category, idx)
                                            .createSelectionId()
                                    });
                                }
                                return accum;
                            }, []);
                            
                        viewModel.categoryNames = true;

                        /** Create view model template */
                            distinctCategories.map((v, i) => {
                                let categoryName = valueFormatter.format(v.category, categoryMetadata.format);                        
                                let defaultColour: Fill = {
                                    solid: {
                                        color: colourPalette.getColor(categoryName).value
                                    }
                                }
                                
                                viewModel.categories.push({
                                    name: categoryName,
                                    category: `${v.category}`,
                                    dataPoints: [],
                                    colour: settings.dataColours.colourByCategory
                                        ?   getCategoricalObjectValue<Fill>(
                                                category,
                                                i,
                                                'dataColours',
                                                'categoryFillColour',
                                                defaultColour
                                            ).solid.color
                                        :   settings.dataColours.defaultFillColour,
                                    selectionId: v.selectionId
                                } as ICategory);
                            });

                        /** Now we can put the values into the right categories */
                            values[0].values.map((v, i) => {
                                viewModel.categories
                                    .filter(c => c.category == `${category.values[i]}`)[0]
                                    .dataPoints.push(parseFloat(<string>v) ? Number(v) : null);
                            });

                    }

                /** Calculate the statistics for all data points */
                    viewModel.statistics = {
                        min: d3.min(allDataPoints),
                        max: d3.max(allDataPoints),
                        deviation: d3.deviation(allDataPoints),
                        iqr: d3.quantile(allDataPoints, 0.75) - d3.quantile(allDataPoints, 0.25),
                        span: d3.max(allDataPoints) - d3.min(allDataPoints)
                    } as IStatistics;
                        
                /** Set up our measure formatter for each category + tooltips */
                    let mFormat = valueFormatter.create({
                        format: measureMetadata.format,
                        value: viewModel.statistics.max,
                        precision: settings.tooltip.precision != null
                            ?   settings.tooltip.precision
                            :   null
                    });
                        
                /** Process the remainder of the view model by category */
                    viewModel.categories.map((c, i) => {
                        c.formatter = mFormat;
                        c.dataPoints
                            .sort(d3.ascending)
                            .filter(v => v !== null);
                        c.statistics = {
                            min: d3.min(c.dataPoints),
                            confidenceLower: d3.quantile(c.dataPoints, 0.05),
                            quartile1: d3.quantile(c.dataPoints, 0.25),
                            median: d3.median(c.dataPoints),
                            mean: d3.mean(c.dataPoints),
                            quartile3: d3.quantile(c.dataPoints, 0.75),
                            confidenceUpper: d3.quantile(c.dataPoints, 0.95),
                            max: d3.max(c.dataPoints),
                            deviation: d3.deviation(c.dataPoints),
                            iqr: d3.quantile(c.dataPoints, 0.75) - d3.quantile(c.dataPoints, 0.25),
                            span: d3.max(c.dataPoints) - d3.min(c.dataPoints)
                        } as IStatistics
                    });

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

            debug.log('Categories and statistics mapped!');
            return viewModel;

        }

        export function visualTransform(options: VisualUpdateOptions, viewModel: IViewModel, settings: VisualSettings, viewport: IViewport) : IViewModel {
            
            /** Set up debugging */
                let debug = new VisualDebugger(settings.about.debugMode && settings.about.debugVisualUpdate);
                debug.log('Completing view model...');

            /** Other pre-requisites */
                let dataViews = options.dataViews,
                    metadata = dataViews[0].metadata,
                    categoryMetadata = metadata.columns.filter(c => c.roles['category'])[0],
                    measureMetadata = metadata.columns.filter(c => c.roles['measure'])[0],
                    kernel = settings.violin.type == 'line'
                        ?   KDE.kernels[settings.violin.kernel]
                        :   {} as IKernel;

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
                                height: settings.xAxis.show && viewModel.categoryNames && settings.xAxis.showLabels
                                    ?   textMeasurementService.measureSvgTextHeight(xAxis.labelTextProperties)
                                        +   xAxis.titleDimensions.height
                                        +   xAxis.padding.top
                                    :   0
                            };

                        /** Figure out how much vertical space we have for the y-axis and assign what we know currently */
                            debug.log('Y-Axis vertical space...');
                            let yPadVert = settings.yAxis.fontSize / 2,
                                yHeight = viewport.height - yPadVert - xAxis.dimensions.height;

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
                                .nice(yAxis.ticks)
                                .clamp(true);
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
                            xAxis.dimensions.width = xAxis.titleDimensions.width = viewport.width - yAxis.dimensions.width
                            xAxis.titleDimensions.x = yAxis.dimensions.width + (xAxis.dimensions.width / 2);
                            xAxis.titleDimensions.y = viewport.height - xAxis.titleDimensions.height;

                        /** Revise Y-axis properties as necessary */
                            debug.log('Y-Axis generator functions...');
                            yAxis.generator = d3.svg.axis()
                                .scale(yAxis.scale)
                                .orient('left')
                                .ticks(yAxis.ticks)
                                .tickSize(-viewport.width + yAxis.dimensions.width)
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

                        /** Vioinlin plot specifics */
                            debug.log('Violin dimensions...');
                            viewModel.violinPlot = {
                                categoryWidth: xAxis.scale.rangeBand(),
                                width: xAxis.scale.rangeBand() - (xAxis.scale.rangeBand() * (settings.violin.innerPadding / 100))
                            } as IViolinPlot;
                            

                        /** Box plot specifics */
                            debug.log('Box plot dimensions...');
                            viewModel.boxPlot = {
                                width: viewModel.violinPlot.width - (viewModel.violinPlot.width * (settings.boxPlot.innerPadding / 100)),
                                maxMeanRadius: 3
                            } as IBoxPlot;
                            viewModel.boxPlot.maxMeanDiameter = viewModel.boxPlot.maxMeanRadius * 2;
                            viewModel.boxPlot.scaledMeanRadius = (viewModel.boxPlot.width / 5);
                            viewModel.boxPlot.scaledMeanDiameter = viewModel.boxPlot.scaledMeanRadius * 2;
                            
                            if (Math.min(viewModel.boxPlot.scaledMeanDiameter, viewModel.boxPlot.maxMeanDiameter) >= viewModel.boxPlot.width) {
                                viewModel.boxPlot.actualMeanDiameter = 0
                            } else {
                                viewModel.boxPlot.actualMeanDiameter = viewModel.boxPlot.scaledMeanDiameter > viewModel.boxPlot.maxMeanDiameter
                                    ?   viewModel.boxPlot.maxMeanDiameter
                                    :   viewModel.boxPlot.scaledMeanDiameter
                            }
                            viewModel.boxPlot.actualMeanRadius = viewModel.boxPlot.actualMeanDiameter / 2;
                            viewModel.boxPlot.xLeft = (viewModel.violinPlot.categoryWidth / 2) - (viewModel.boxPlot.width / 2);
                            viewModel.boxPlot.xRight = (viewModel.violinPlot.categoryWidth / 2) + (viewModel.boxPlot.width / 2);

                        viewModel.yAxis = yAxis;
                        viewModel.xAxis = xAxis;

                /** Add vertical X-axis properties */
                    viewModel.xVaxis = viewModel.yAxis;

                /** Do Kernel Density Estimator on the vertical X-axis, if we want to render a line for violin */
                    if (settings.violin.type == 'line') {

                        /** Keep track of the axis limits so that we can adjust them later if necessary
                         *  TODO: try and do this once if possible
                         */
                        let yMin = viewModel.yAxis.domain[0],
                            yMax = viewModel.yAxis.domain[1];
                    
                        debug.log('Kernel Density Estimation...');

                        /** Map out KDE for each series (TODO we might be able to do this in-line when we refactor the data mapping) */
                            viewModel.categories.map(v => {

                                /** Makes logging a bit less complex when discerning between series */
                                    let series = v.name ? v.name : 'ALL';

                                /** Through analysis, we can apply a scaling to the line based on the axis ticks, and a factor supplied by
                                 *  the resolution enum. Through some profiling with a few different sets of test data, the values in the enum
                                 *  seem to generate an array suitable enough to 'improve' the resolution of the line within the confines of the
                                 *  viewport sufficiently. There may well be a better way to do this, but it will suffice for now and makes the 
                                 *  process sufficiently straightforward for the end-user...
                                 */
                                    let kde = kernelDensityEstimator(
                                            kernel.window,
                                            viewModel.statistics.bandwidthActual,
                                            viewModel.xVaxis.scale.ticks(parseInt(settings.violin.resolution))
                                        );

                                    /** We'll need to return slightly different results based on whether we wish to clamp the data or converge it, so let's sort that out 
                                     *  Many thanks to Andrew Sielen's Block for inspiration on this (http://bl.ocks.org/asielen/92929960988a8935d907e39e60ea8417)
                                     */
                                        let kdeData = kde(v.dataPoints),
                                        /** If not clamping then we'll always cap at the min/max boundaries of the series */
                                            interpolateMin = v.statistics.min,
                                            interpolateMax = v.statistics.max;
                                            debug.log(`[${series}] Interpolation checkpoint #1 (min/max) - iMin: ${interpolateMin}; sMin: ${v.statistics.min} iMax: ${interpolateMax}; sMax: ${v.statistics.max}`);

                                        if (!settings.violin.clamp) {

                                            /** Second phase - we try to converge the chart within the confines of the series min/max */
                                                debug.log(`[${series}] Convergence required on violin plot. Doing further interpolation checks and processing...`);
                                                interpolateMin = d3.max(
                                                    kdeData.filter(d => d.x < v.statistics.min && d.y == 0), (d) => d.x
                                                ),
                                                interpolateMax = d3.min(
                                                    kdeData.filter(d => d.x > v.statistics.max && d.y == 0), (d) => d.x
                                                );
                                                debug.log(`[${series}] Interpolation checkpoint #2 (filtering) - iMin: ${interpolateMin}; sMin: ${v.statistics.min} iMax: ${interpolateMax}; sMax: ${v.statistics.max}`);
                                            
                                            /** Third phase - if either interpolation data point is still undefined then we run KDE over it until we find one, or run out of road and set one */
                                                if (!interpolateMin || !interpolateMax) {
                                                    debug.log(`[${series}] Couldn\'t converge following checkpoint #2. Applying further KDE to data to find a suitable point...`);
                                                    let kdeRoot = kernelDensityRoot(
                                                        kernel.window,
                                                        viewModel.statistics.bandwidthActual,
                                                        v.dataPoints
                                                    );
                                                    
                                                    if (!interpolateMin) {
                                                        interpolateMin = kernelDensityInterpolator(v.statistics.min, ELimit.min, kdeRoot);
                                                        debug.log(`[${series}] Applied KDE to minimum value. New value: ${interpolateMin}`);
                                                    }
                                                    if (!interpolateMax) {
                                                        interpolateMax = kernelDensityInterpolator(v.statistics.max, ELimit.max, kdeRoot);
                                                        debug.log(`[${series}] Applied KDE to maximum value. New value: ${interpolateMax}`);
                                                    }
                                                    debug.log(`[${series}] Interpolation checkpoint #3 (KDE) - iMin: ${interpolateMin}; sMin: ${v.statistics.min} iMax: ${interpolateMax}; sMax: ${v.statistics.max}`);
                                                }                                            

                                            /** If our KDE value exceeds the y-axis domain, then we need to extend it to fit the plot.
                                             *  There are some other adjustments to make as well (detailed in comments below).
                                             */
                                                if (interpolateMin && interpolateMin < yMin) {
                                                    debug.log(`[${series}] Interpolation exceeds y-axis minimum (currently ${yMin}). Reducing to ${interpolateMin}`);
                                                    yMin = interpolateMin;
                                                }
                                                if (interpolateMax && interpolateMax > yMax) {
                                                    debug.log(`[${series}] Interpolation exceeds y-axis maximum (currently ${yMax}). Extending to ${interpolateMax}`);
                                                    yMax = interpolateMax;
                                                }

                                            /** Add an array element to the KDE if less than our original test ranges. Otherwise, set our lowest
                                             *  sample to zero to make it converge nicely (this is a bit hacky but prevents us from extending the axis
                                             *  if we don't really need to for these edge cases).
                                             */
                                                if (interpolateMin < kdeData[0].x) {
                                                    debug.log(`[${series}] Interpolation minimum exceeds KDE values. Adding convergence point to start of KDE array.`);
                                                    kdeData.unshift({
                                                        x: interpolateMin,
                                                        y: 0,
                                                        remove: false
                                                    })
                                                };

                                            /** Highest value is a little different, as it can exist somewhere before the end of the array, so we need
                                             *  to find the correct element in there to apply the convergence point.
                                             */
                                                if (interpolateMax > kdeData[kdeData.length - 1].x) {
                                                    debug.log(`[${series}] Interpolation maximum exceeds KDE values. Adding convergence point to end of KDE array.`);
                                                    kdeData.push({
                                                        x: interpolateMax,
                                                        y: 0,
                                                        remove: false
                                                    })
                                                }

                                            /** We'll now re-process the array to ensure that we filter out the correct erroneous KDE values */
                                                    debug.log(`[${series}] Finding suitable KDE array min/max convergence points...`);
                                                    let foundExtentMax = false;

                                                    kdeData = kdeData.map(function (d, i) {
                                                        /** Grab the current data point; we'll return it unprocessed if no conditions are hit */
                                                            let kdePoint = {
                                                                    x: d.x,
                                                                    y: d.y,
                                                                    remove: false
                                                                } as IDataPointKde;
                                                             
                                                        /** Converge anything outside of the min/max extents */
                                                            if (d.x <= interpolateMin || d.x >= interpolateMax) {
                                                                kdePoint.y = 0;
                                                            }

                                                        /** If we hit the minimum extent, then flag anything else that comes ahead of it, as we've already moved past them */
                                                            if (    d.x < interpolateMin
                                                                &&  kdeData[i + 1]
                                                                &&  kdeData[i + 1].x < interpolateMin
                                                            ) {
                                                                kdePoint.remove = true;
                                                            }

                                                        /** Deal with max extent */
                                                            if (d.x >= interpolateMax) {
                                                                if (!foundExtentMax) {
                                                                    foundExtentMax = true;
                                                                } else {
                                                                    kdePoint.remove = true;
                                                                }
                                                                kdePoint.y = 0;
                                                            }

                                                        return kdePoint;
                                                    });

                                            /** Filter out the data we don't need after processing it and we are go! */
                                                debug.log(`[${series}] Removing erroneous KDE array elements...`);
                                                v.dataKde = kdeData
                                                    .filter((d) => 
                                                        d.remove == false
                                                    );

                                        } else {
                                            /** Just filter out anything outside the ranges, as we're not converging */
                                                v.dataKde = kdeData
                                                    .filter(d => !interpolateMin || (d.x >= interpolateMin && d.y != 0))    
                                                    .filter(d => !interpolateMax || (d.x <= interpolateMax && d.y != 0));
                                        }
                                        
                                    /** Adjust violin scale to account for inner padding preferences */
                                        let violinFullWidth = xAxis.scale.rangeBand() / 2;
                                        v.yVScale = d3.scale.linear()
                                            .range([
                                                0, 
                                                /** Width of x-axis adjusted for inner padding */
                                                violinFullWidth - (violinFullWidth * (settings.violin.innerPadding / 100))
                                            ])
                                            .domain([0, d3.max<IDataPointKde>(v.dataKde, d => d.y)])
                                            .clamp(true);

                                    /** Now we have our scaling, we can generate the functions for each series */
                                        v.lineGen = d3.svg.line<IDataPointKde>()
                                            .interpolate(settings.violin.lineType)
                                            .x(d => viewModel.xVaxis.scale(d.x))
                                            .y(d => v.yVScale(d.y));
                                        v.areaGen = d3.svg.area<IDataPointKde>()
                                            .interpolate(settings.violin.lineType)
                                            .x(d => viewModel.xVaxis.scale(d.x))
                                            .y0(v.yVScale(0))
                                            // .y0(-0.5) /** This fixes a whitespace issue between each side */
                                            .y1(d => v.yVScale(d.y));

                            });

                        /** This adjusts the domain of each axis to match any adjustments we made earlier on.
                         *  It's repeated code for now, so we should see if we can normalise later on when we clean up.
                         */
                            viewModel.yAxis.scale
                                .domain([yMin, yMax])
                                .nice()
                                .clamp(true);
                            viewModel.xVaxis.scale
                                .domain([yMin, yMax])
                                .nice()
                                .clamp(true);

                    }

            debug.log('View model completely mapped!');
            return viewModel;

        }

        /**
         * Render SVG line and area for a given violin series
         * 
         * @param seriesContainer   The element to apply the SVG rendering to
         * @param viewModel         The view model object to use
         * @param settings          Visual settings
         * @param side              The side to render the plot on (we need two plots per series for a violin)
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
                    if (settings.violin.transparency != 100) {
                        violinContainer.append('path')
                            .classed('violinPlotViolinArea', true)
                            .attr('d', d => d.areaGen(d.dataKde))
                            .style({
                                'fill': d => d.colour,
                                'fill-opacity': 1 - (settings.violin.transparency / 100),
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
         * @param seriesContainer   The element to apply the SVG rendering to
         * @param viewModel         The view model object to use
         * @param settings          Visual settings
         */
            export function renderViolin(seriesContainer: d3.Selection<ViolinPlotModels.ICategory>, viewModel: IViewModel, settings: VisualSettings) {

                if (settings.violin.type == 'line') {

                    renderViolinLine(seriesContainer, viewModel, settings, EViolinSide.left);
                    renderViolinLine(seriesContainer, viewModel, settings, EViolinSide.right);

                }

            }

        /**
         * Handle rendering of a box plot whisker. Will render for the specified range.
         * For top, this will run from quartile 3 to 95%;
         * For bottom, this will run from 5% to quartile 1;
         * 
         * @param seriesContainer   The element to apply the SVG rendering to
         * @param viewModel         The view model object to use
         * @param settings          Visual settings
         * @param whisker           The whisker to render 
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
                        'stroke-width': `${settings.boxPlot.strokeWidth}px`,
                        'stroke': `${settings.boxPlot.boxFillColour}`
                    });

            }

            export function renderBoxPlot(seriesContainer: d3.Selection<ViolinPlotModels.ICategory>, viewModel: IViewModel, settings: VisualSettings) {

                if (viewModel.boxPlot.width > settings.boxPlot.strokeWidth) {

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
                                'stroke': `${settings.boxPlot.boxFillColour}`,
                                'stroke-width': `${settings.boxPlot.strokeWidth}px`,
                                'fill': `${settings.boxPlot.boxFillColour}`,
                                'fill-opacity': 1 - (settings.boxPlot.transparency / 100)
                            });

                    /** Do the whiskers, if we need them */
                        if (settings.boxPlot.showWhiskers) {
                            renderBoxPlotWhisker(boxContainer, viewModel, settings, EBoxPlotWhisker.bottom);
                            renderBoxPlotWhisker(boxContainer, viewModel, settings, EBoxPlotWhisker.top);
                        }

                    /** Mean and median */
                        if (settings.boxPlot.showMedian){
                            boxContainer.append('line')
                            .classed({
                                'violinPlotBoxPlot': true,
                                'median': true
                            })
                            .attr({
                                'x1': viewModel.boxPlot.xLeft + (settings.boxPlot.strokeWidth / 2),
                                'x2': viewModel.boxPlot.xRight - (settings.boxPlot.strokeWidth / 2),
                                'y1': (d) => viewModel.yAxis.scale(d.statistics.median),
                                'y2': (d) => viewModel.yAxis.scale(d.statistics.median),
                                'stroke': `${settings.boxPlot.medianFillColour}`,
                                'stroke-width': `${settings.boxPlot.strokeWidth}px`,
                            });
                        }

                        if (settings.boxPlot.showMean && viewModel.boxPlot.width > viewModel.boxPlot.actualMeanDiameter) {
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
                                    'fill': settings.boxPlot.meanFillColourInner,
                                    'stroke': settings.boxPlot.meanFillColour,
                                    'stroke-width': `${settings.boxPlot.strokeWidth}px`
                                });
                        }

                }

            }

        /**
         * For supplied selection, textProperties and width, try to concatenate the text with ellipses if it overflows the specified width
         * 
         * @param selection             - D3 selection to apply formatting to
         * @param textProperties        - Properties of the text to assess
         * @param width                 - Width to fit the text
         */
        export function wrapText(selection: d3.Selection<any>, textProperties: TextProperties, width?: number): void {
            var width = width || 0,
                textLength = textMeasurementService.measureSvgTextWidth(
                    textProperties,
                    selection.text()
                ),
                text = selection.text();
            while (textLength > (width) && text.length > 0) {
                text = text.slice(0, -1);
                selection.text(text + '\u2026');
                textLength = textLength = textMeasurementService.measureSvgTextWidth(
                    textProperties,
                    selection.text()
                );
            }
            if (textLength > width) {
                selection.text('');
            }
        }

    }
}