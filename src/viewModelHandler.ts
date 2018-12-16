module powerbi.extensibility.visual {

    export module ViolinPlotHelpers {

        /** Internal view models */
            import IViewModel = ViolinPlotModels.IViewModel;
            import ICategory = ViolinPlotModels.ICategory;
            import IViolinPlot = ViolinPlotModels.IViolinPlot;
            import IBoxPlot = ViolinPlotModels.IBoxPlot;
            import IStatistics = ViolinPlotModels.IStatistics;
            import IDataPointKde = ViolinPlotModels.IDataPointKde;
            import IAxisLinear = ViolinPlotModels.IAxisLinear;
            import IAxisCategorical = ViolinPlotModels.IAxisCategorical;
            import IDisplayName = ViolinPlotModels.IDisplayName;
            import EViolinSide = ViolinPlotModels.EViolinSide;
            import EBoxPlotWhisker = ViolinPlotModels.EBoxPlotWhisker;

        /** KDE helpers */
            import IKernel = KDE.IKernel;

        /** powerbi.extensibility.utils.type */
            import PixelConverter = powerbi.extensibility.utils.type.PixelConverter;

        /** powerbi.extensibility.utils.formatting */
            import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
            import textMeasurementService = powerbi.extensibility.utils.formatting.textMeasurementService;
            import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;

        /** powerbi.extensibility.utils.chart */
            import axisHelper = powerbi.extensibility.utils.chart.axis;

        export class ViewModelHandler {

            viewModel: IViewModel;
            viewport: IViewport;
            settings: VisualSettings;
            kernel: IKernel;
            measureMetadata: DataViewMetadataColumn;
            categoryMetadata: DataViewMetadataColumn;
            categoryTextProperties: TextProperties;
            debug: boolean;

            private allDataPoints: number[];

            constructor() {
                this.viewModel = {
                    categoriesReduced: false,
                    profiling: {
                        categories: []
                    },
                    statistics: {}
                } as IViewModel;
                this.debug = false;
            }

            /**
             * Populates the core data from the data view, meaning that if we don't need to re-do this (e.g. for resizes or other non-data-volatile
             * operations), then we can omit it.
             * 
             * @param options                                   - visual update options
             * @param host                                      - visual host
             * @param colourPalette                             - visual colour palette object (for colour assignment to categories)
             */
                mapDataView(options: VisualUpdateOptions, host: IVisualHost, colourPalette: IColorPalette) {
                                
                    /** Set up debugging */
                        let debug = new VisualDebugger(this.debug);
                        debug.log('Starting mapDataView');
                        debug.log('Mapping data view to view model...'); 
                        debug.profileStart();

                    let dataViews = options.dataViews;

                    /** Create bare-minimum view model */
                        let viewModel = this.viewModel;
    
                    /** Return this bare-minimum model if the conditions for our data view are not satisfied (basically don't draw the chart) */
                        if (!dataViews
                            || !dataViews[0]
                            || !dataViews[0].categorical
                            || !dataViews[0].categorical.values
                            || !dataViews[0].metadata
                        ) {
                            debug.log('Data mapping conditions not met. Returning bare-minimum view model.');
                            this.viewModel = viewModel;
                        }

                    /** Otherwise, let's get that data! */
                        debug.log('Data mapping conditions met. Proceeding with view model transform.');
                        let values = dataViews[0].categorical.values,
                            metadata = dataViews[0].metadata,
                            category = metadata.columns.filter(c => c.roles['category'])[0]
                                ?   dataViews[0].categorical.categories[0]
                                :   null;
                        this.categoryMetadata = metadata.columns.filter(c => c.roles['category'])[0];
                        this.categoryTextProperties = {
                            fontFamily: this.settings.xAxis.fontFamily,
                            fontSize: PixelConverter.toString(this.settings.xAxis.fontSize)
                        };
                        viewModel.categories = [];

                        /** Assign initial category data to view model. This will depend on whether we have a category grouping or not, so set up accordingly. 
                         *
                         *  WHY ARE WE USING A CATEGORICAL DATA VIEW MAPPING IN THIS WAY? 
                         * 
                         *  Using a matrix, table or categorical mapping with grouping makes more sense, but as our sampling value is typically unique to each 
                         *  row, this means that Power BI needs to calculate and retrieve an aggregate for every combination of sampling and category. This will
                         *  mean that of the data that comes back, it will be mostly `null` values, for each category, with the actual values in there somewhere.
                         *  This creates a lot of data to transfer over HTTP and a lot of memory to process and organise when we get it.
                         * 
                         *  By doing it this way, we get sinlge-dimension arrays for all category/sampling combinations, and then values, so at most this gives us
                         *  a 30K row limit (until we can implement `fetchmoreData` successfully). We trade-off a bit of WTF this side as a result. Maybe I'll
                         *  revisit when I'm a bit wiser.
                         * 
                         *  We also have an issue in that the user could conceivably add a high-cardinality-field to the category, when they actually
                         *  meant to put it in the sampling field and vice-versa. This would cause us to render up to 30K categories, with a single data
                         *  point in them, which is also incredibly costly from a KDE perspective. 
                         * 
                         *  This actually cause the visual to fail validation due to the MS tester trying this out. I was a little too close to the project
                         *  and made sure that the "happy path" was working well, but hadn't considered this scenario. It is entirely possible and should be
                         *  mitigated. 
                         * 
                         *  In this scenario, we'd normally use the `dataReductionAlgorithm` setting in the `capabilities.json` file to manage this
                         *  but the sacrifices we made to the data view mapping (see notes in `mapDataView`), we don't get the flexibility we need to
                         *  prevent a user from killing their own browser.
                         * 
                         *  So, we leverage the `categoryLimit` setting in the `dataLimitSettings` class to place an arbitrary restriction on this that we
                         *  may be able to relax in a user setting later on, should it be successful, or we can better manage with the `capabilities.json'
                         *  file if yours truly gets a bit smarter further down the track.
                         * 
                         *  We filter down the array here, as we need to calculate stats for all categories obtained from the data model so that we can do the
                         *  requisite sorting on them. The stats calculation is pretty negligible in terms of processing time for large datasets (< 200ms
                         *  on average).
                         * 
                         *  By doing this we can also avoid unnecessary KDE operations, which outside of rendering are the biggest cost by far.
                         * 
                         *  If the array is filtered down to the `categoryLimit` value, we'll set a flag in the view model to alert the user.                         * 
                         */

                            /** Create our allDatapoints array for later (as we only want to include datapoints that are in the final set after 
                             *  category reduction, if applicable) */
                                this.allDataPoints = [];

                            if (!category) {
                                debug.log('No categories specified. Setting up single category for all data points...');
                                this.allDataPoints = <number[]>values[0].values
                                    .sort(d3.ascending);
                                viewModel.categoryNames = false;
                                viewModel.categories.push({
                                    name: '',
                                    displayName: {
                                        formattedName: '',
                                        textProperties: this.categoryTextProperties,
                                        formattedWidth: 0
                                    },
                                    colour: this.settings.dataColours.defaultFillColour,
                                    selectionId: null,
                                    dataPoints: this.allDataPoints
                                } as ICategory);

                            } else {

                                /** Get unique category values and data points
                                 * 
                                 *  #44: We used an `Array.prototype.reduce()` here previously but this would take ages to iterate over and check for duplicates
                                 *  when we had put a high-cardinality field in the Category well and we couldn't break out. The `for` loop is less elegant but
                                 *  performs much better and allows us to break out when we hit our prescribed limit.
                                 */
                                    debug.log('Getting unique category values...');
                                    let distinctCategories: ICategory[] = [],
                                        distinctCategoriesFound = 0,
                                        distinctCategoryLimit = this.settings.dataLimit.categoryLimit;

                                    for (let i = 0; i < category.values.length; i++) {

                                        let categoryName = category.values[i].toString(),
                                            value = parseFloat(<string>values[0].values[i]) 
                                                        ?   Number(values[0].values[i]) 
                                                        :   null;

                                        if (!distinctCategories.filter(c => c.name == `${categoryName}`)[0]) {

                                            if (distinctCategoriesFound == distinctCategoryLimit) {
                                                debug.log(`Category limit of ${distinctCategoryLimit} reached. Ending category resolution to avoid performance issues.`);
                                                this.viewModel.categoriesReduced = true;
                                                break;
                                            }

                                            distinctCategoriesFound ++;

                                            let defaultColour: Fill = {
                                                solid: {
                                                    color: colourPalette.getColor(categoryName).value
                                                }
                                            }

                                            distinctCategories.push({
                                                name: categoryName,
                                                sortOrder: distinctCategoriesFound,
                                                selectionId: host.createSelectionIdBuilder()
                                                    .withCategory(category, i)
                                                    .createSelectionId(),
                                                objectIndex: i,
                                                dataPoints: [],
                                                colour: this.settings.dataColours.colourByCategory
                                                    ?   getCategoricalObjectValue<Fill>(
                                                            category,
                                                            i,
                                                            'dataColours',
                                                            'categoryFillColour',
                                                            defaultColour
                                                        ).solid.color
                                                    :   this.settings.dataColours.defaultFillColour,
                                            } as ICategory);
                                            
                                        }

                                        /** Add the value, to save us doing one iteration of a potentially large value array later on */
                                            distinctCategories[distinctCategoriesFound - 1].dataPoints.push(value);
                                            this.allDataPoints.push(value);
                                    }
                                    
                                viewModel.categoryNames = true;

                                /** Create view model template */
                                    debug.log(`${distinctCategoriesFound} distinct categories found (or capped).`);
                                    debug.log('Mapping distinct categories into view model...');
                                    viewModel.categories = distinctCategories;
                            }

                    /** We're done! */
                        this.viewModel = viewModel;
                        debug.log('Finished mapDataView');
                        this.addDebugProfile(debug, 'mapDataView');
                        debug.footer();
                }

            /**
             * Pushes an IProfilerCategory into the view model `profiling` object
             * 
             * @param debug                                     - `VisualDebugger` instance to attach
             * @param category                                  - name of profiling category
             */
                addDebugProfile(debug: VisualDebugger, category: string) {
                    this.viewModel.profiling.categories.push(debug.getSummary(category));
                }

            /**
             * For the data that we have, calculate all necessary statistics we will need for drawing the plot
             */
                calculateStatistics() {

                    /** Set up debugging */
                        let debug = new VisualDebugger(this.debug);
                        debug.log('Starting calculateStatistics');
                        debug.log('Calculating statistics over view model data...'); 
                        debug.profileStart();

                    /** All data points */
                        debug.log('All data points...');
                        this.viewModel.statistics.max = d3.max(this.allDataPoints);
                        this.viewModel.statistics.min = d3.min(this.allDataPoints);
                        this.viewModel.statistics.deviation = d3.deviation(this.allDataPoints);
                        this.viewModel.statistics.quartile1 = d3.quantile(this.allDataPoints, 0.25);
                        this.viewModel.statistics.quartile3 = d3.quantile(this.allDataPoints, 0.75);
                        this.viewModel.statistics.iqr = this.viewModel.statistics.quartile3 - this.viewModel.statistics.quartile1;
                        this.viewModel.statistics.span = this.viewModel.statistics.max - this.viewModel.statistics.min;

                    /** Process the remainder of the view model by category 
                     *  #44: For no categories, we can re-use the min/max/iqr/deviation/span/quartiles withough going back to the d3.js well.
                     *          For those with categories, we'll caculate all data points once and re-use where we can to avoid unnecessary
                     *          array processing operations.
                     */
                        debug.log('Updating categories...');
                        this.viewModel.categories.map((c, i) => {
                            c.dataPoints
                                .sort(d3.ascending)
                                .filter(v => v !== null);
                            c.statistics = {
                                min: d3.min(c.dataPoints),
                                max: d3.max(c.dataPoints),
                                deviation: d3.deviation(c.dataPoints),
                                quartile1: d3.quantile(c.dataPoints, 0.25),
                                quartile3: d3.quantile(c.dataPoints, 0.75),
                                confidenceLower: d3.quantile(c.dataPoints, 0.05),
                                median: d3.median(c.dataPoints),
                                mean: d3.mean(c.dataPoints),
                                confidenceUpper: d3.quantile(c.dataPoints, 0.95)
                            } as IStatistics
                            
                            c.statistics.iqr = c.statistics.quartile3 - c.statistics.quartile1;
                            c.statistics.span = c.statistics.max - c.statistics.min;
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
                        if (this.settings.violin.type == 'line') {

                            debug.log('Instantiating KDE kernel and bandwidth settings...');
                        
                            /** Sigma function to account for outliers */
                                let bwSigma = Math.min(this.viewModel.statistics.deviation, this.viewModel.statistics.iqr / 1.349);
                                
                            /** Allocate the selected kernel from the properties pane */
                                debug.log(`Using ${this.settings.violin.kernel} kernel`);
                                this.kernel = KDE.kernels[this.settings.violin.kernel];

                            /** Because bandwidth is subjective, we use Silverman's rule-of-thumb to try and predict the bandwidth based on the spread of data.
                                 *  The use may wish to override this, so substitute for this if supplied. We'll keep the derived Silverman bandwidth for the user
                                 *  to obtain from the tooltip, should they wish to 
                                 */
                                this.viewModel.statistics.bandwidthSilverman = 
                                        this.kernel.factor 
                                    *   bwSigma 
                                    *   Math.pow(this.allDataPoints.length, -1/5);
                                this.viewModel.statistics.bandwidthActual = this.settings.violin.specifyBandwidth && this.settings.violin.bandwidth
                                    ?   this.settings.violin.bandwidth
                                    :   this.viewModel.statistics.bandwidthSilverman;

                        }

                    /** We're done! */
                        debug.log('Finished calculateStatistics');
                        this.addDebugProfile(debug, 'calculateStatistics');
                        debug.footer();
                    
                }

            /** If we're sorting, sort the categories appropriately. */
                sortAndFilterData() {

                    /** Set up debugging */
                        let debug = new VisualDebugger(this.debug);
                        debug.log('Starting sortData');
                        debug.log('Managing sorting based on preferences'); 
                        debug.profileStart();

                    /** Manage the sort */
                        if (this.viewModel.categoryNames) {
                            debug.log(`Sorting by ${this.settings.sorting.by}`);
                            this.viewModel.categories.sort((x, y) => {
                                switch (this.settings.sorting.by) {
                                    case 'category': {
                                        return d3[`${this.settings.sorting.order}`](x.sortOrder, y.sortOrder);
                                    }
                                    case 'samples': {
                                        return d3[`${this.settings.sorting.order}`](x.dataPoints.length, y.dataPoints.length);
                                    }
                                    case 'median':
                                    case 'mean':
                                    case 'min':
                                    case 'max': {
                                        return d3[`${this.settings.sorting.order}`](x.statistics[`${this.settings.sorting.by}`], y.statistics[`${this.settings.sorting.by}`]);
                                    }
                                }
                            });
                        } else {
                            debug.log('No sorting required!');
                        }

                    /** We're done! */
                        debug.log('Finished sortData');
                        this.addDebugProfile(debug, 'sortData');
                        debug.footer();
                }

            /**
             * Creates the bare-bones a and y axis objects in the view model.
             * 
             * @param options                                   - visual update options
             */
                initialiseAxes(options: VisualUpdateOptions) {
                    
                    /** Set up debugging */
                        let debug = new VisualDebugger(this.debug);
                        debug.log('Starting initialiseAxes');
                        debug.log('Creating bare-minimum axis objects...'); 
                        debug.profileStart();

                    /** Other pre-requisites */
                        let dataViews = options.dataViews,
                            metadata = dataViews[0].metadata;
                        this.measureMetadata = metadata.columns.filter(c => c.roles['measure'])[0];

                    /** Y-axis (initial) */
                        debug.log('Initial Y-Axis setup...');

                        this.viewModel.yAxis = {
                            padding: {
                                left: 5
                            },
                            heightLimit: this.settings.yAxis.heightLimit,
                            labelTextProperties: {
                                fontFamily: this.settings.yAxis.fontFamily,
                                fontSize: PixelConverter.toString(this.settings.yAxis.fontSize)
                            },
                            labelFormatter: valueFormatter.create({
                                format: this.measureMetadata.format,
                                value: this.settings.yAxis.labelDisplayUnits == 0
                                    ?   this.viewModel.statistics.max
                                    :   this.settings.yAxis.labelDisplayUnits,
                                precision: this.settings.yAxis.precision != null
                                    ?   this.settings.yAxis.precision
                                    :   null
                            })
                        } as IAxisLinear;

                        /** Initial domain based on view model statistics */
                            this.updateYDomain([
                                this.viewModel.statistics.min,
                                this.viewModel.statistics.max
                            ], debug);

                    /** X-Axis (initial) */
                        debug.log('Initial X-Axis setup...');
                        this.viewModel.xAxis = {
                            padding: {
                                top: 5
                            },
                            widthLimit: this.settings.xAxis.widthLimit,
                            labelTextProperties: {
                                fontFamily: this.settings.xAxis.fontFamily,
                                fontSize: PixelConverter.toString(this.settings.xAxis.fontSize),
                                text: this.viewModel.categories[0].name
                            },
                            domain: this.viewModel.categories.map(d => d.name)
                        } as IAxisCategorical;

                    /** Add vertical X-axis properties */
                        debug.log('Cloning y-axis into vertical x-axis...');
                        this.viewModel.xVaxis = this.viewModel.yAxis;

                    /** Initial sizing */
                        this.resyncDimensions();

                    /** We're done! */
                        debug.log('Finished initialiseAxes');
                        this.addDebugProfile(debug, 'initialiseAxes');
                        debug.footer();

                }

            /**
             * Set up the display of the axis title and labels, and manage any sizing calculations and re-draws as necessary.
             */
                processAxisText() {

                    /** Set up debugging */
                        let debug = new VisualDebugger(this.debug);
                        debug.log('Starting processAxisText');
                        debug.log('Calculating axis labels and titles'); 
                        debug.profileStart();

                    /** Y-axis title */
                        if (this.settings.yAxis.showTitle) {
                                    
                            debug.log('Y-axis title initial setup...');
                            
                            let title = this.formatYAxistitle(debug);

                            this.viewModel.yAxis.titleDisplayName = this.getTailoredDisplayName(
                                title,
                                {
                                    fontFamily: this.settings.yAxis.titleFontFamily,
                                    fontSize:PixelConverter.toString(this.settings.yAxis.titleFontSize),
                                    text: title
                                },
                                this.viewModel.yAxis.dimensions
                                    ?   this.viewModel.yAxis.dimensions.height
                                    :   this.viewport.height
                            )

                        }

                        /** Resync if showing the axis at all */
                            if (this.settings.yAxis.show) {
                                this.resyncDimensions();
                            }

                    /** Manage the x-axis label/title and sizing */
                        debug.log('X-axis label and title sizing...');

                        /** Manage display label overflow if required. By doing this, we can use the raw,
                         *  unformatted category name to define our ticks, but format them correctly in the
                         *  event of us wishing to use ellipses etc.
                         *  
                         *  We'll work out the tailored name vs. the original name, and that way we can determine
                         *  how many categories have been reduced to their ellipses. If all have been reduced then
                         *  we can just remove the axis labels as they serve no purpose.
                         */
                            
                            if (this.viewModel.categoryNames){

                                debug.log('X-axis labels...');
                                let xTickMapper = {},
                                    collapsedCount = 0;

                                    this.viewModel.categories.map(c => {
                                    c.displayName = this.getTailoredDisplayName(
                                        valueFormatter.format(c.name, this.categoryMetadata.format),
                                        {
                                            fontFamily: this.categoryTextProperties.fontFamily,
                                            fontSize: this.categoryTextProperties.fontSize,
                                            text: valueFormatter.format(c.name, this.categoryMetadata.format)
                                        },
                                        this.viewModel.xAxis.scale
                                            ?   this.viewModel.xAxis.scale.rangeBand()
                                            :   this.viewport.width / this.viewModel.categories.length
                                    );
                                    
                                    collapsedCount += c.displayName.collapsed
                                        ?   1
                                        :   0;
                                    
                                    xTickMapper[`${c.name}`] = c.displayName.tailoredName;

                                });

                                this.viewModel.categoriesAllCollapsed = collapsedCount == this.viewModel.categories.length;

                                if (this.viewModel.xAxis.generator){

                                    this.viewModel.xAxis.generator.tickFormat(d => {
                                    
                                        /** If all our ticks got collapsed, we might as well not have them... */
                                            if (this.viewModel.categoriesAllCollapsed || !this.settings.xAxis.showLabels) {
                                                return '';
                                            } else {
                                                return xTickMapper[d];
                                            }

                                    });

                                }
                                
                            } else {

                                this.viewModel.xAxis.generator.tickFormat('');

                            }

                        /** Repeat for the X-Axis title */
                            if (this.settings.xAxis.showTitle) {
                                
                                debug.log('X-axis title...');
                                let xAxisTitleFormatted = !this.categoryMetadata 
                                        ?   ''
                                        :   (!this.settings.xAxis.titleText 
                                                ?   this.categoryMetadata.displayName
                                                :   this.settings.xAxis.titleText
                                            ).trim();
                                this.viewModel.xAxis.titleDisplayName = this.getTailoredDisplayName(
                                    xAxisTitleFormatted,
                                    {
                                        fontFamily: this.settings.xAxis.titleFontFamily,
                                        fontSize:PixelConverter.toString(this.settings.xAxis.titleFontSize),
                                        text: xAxisTitleFormatted
                                    },
                                    this.viewModel.xAxis.dimensions.width
                                )

                            }

                        /** Resync if showing the axis at all */
                            if (this.settings.xAxis.show) {
                                this.resyncDimensions();
                            }                    

                    /** We're done! */
                        debug.log('Finished processAxisText');
                        this.addDebugProfile(debug, 'processAxisText');
                        debug.footer();
                }

            /**
             * Do Kernel Density Estimator on the vertical X-axis, if we want to render a line for violin.
             */
                doKde() {

                    /** Set up debugging */
                        let debug = new VisualDebugger(this.debug);
                        debug.log('Starting doKde');
                        debug.log('Performing KDE on visual data...'); 
                        debug.profileStart();

                    if (this.settings.violin.type == 'line' && !this.viewModel.yAxis.collapsed) {

                        /** Keep track of the axis limits so that we can adjust them later if necessary */
                        let yMin = this.viewModel.yAxis.domain[0],
                            yMax = this.viewModel.yAxis.domain[1];
                    
                        debug.reportExecutionTime();
                        debug.log('Kernel Density Estimation...');

                        /** Map out KDE for each series (TODO we might be able to do this in-line when we refactor the data mapping) */
                            this.viewModel.categories.map(v => {

                                /** Makes logging a bit less complex when discerning between series */
                                    let series = v.name ? v.name : 'ALL';

                                /** Through analysis, we can apply a scaling to the line based on the axis ticks, and a factor supplied by
                                 *  the resolution enum. Through some profiling with a few different sets of test data, the values in the enum
                                 *  seem to generate an array suitable enough to 'improve' the resolution of the line within the confines of the
                                 *  viewport sufficiently. There may well be a better way to do this, but it will suffice for now and makes the 
                                 *  process sufficiently straightforward for the end-user...
                                 */
                                    let kde = KDE.kernelDensityEstimator(
                                            this.kernel.window,
                                            this.viewModel.statistics.bandwidthActual,
                                            this.viewModel.xVaxis.scale.ticks(parseInt(this.settings.violin.resolution))
                                        );

                                    /** We'll need to return slightly different results based on whether we wish to clamp the data or converge it, so let's sort that out 
                                     *  Many thanks to Andrew Sielen's Block for inspiration on this (http://bl.ocks.org/asielen/92929960988a8935d907e39e60ea8417)
                                     */
                                        let kdeData = kde(v.dataPoints),
                                        /** If not clamping then we'll always cap at the min/max boundaries of the series */
                                            interpolateMin = v.statistics.min,
                                            interpolateMax = v.statistics.max;
                                            debug.log(`[${series}] Interpolation checkpoint #1 (min/max) - iMin: ${interpolateMin}; sMin: ${v.statistics.min} iMax: ${interpolateMax}; sMax: ${v.statistics.max}`);

                                        if (!this.settings.violin.clamp) {

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
                                                    let kdeRoot = KDE.kernelDensityRoot(
                                                        this.kernel.window,
                                                        this.viewModel.statistics.bandwidthActual,
                                                        v.dataPoints
                                                    );
                                                    
                                                    if (!interpolateMin) {
                                                        interpolateMin = KDE.kernelDensityInterpolator(v.statistics.min, KDE.ELimit.min, kdeRoot);
                                                        debug.log(`[${series}] Applied KDE to minimum value. New value: ${interpolateMin}`);
                                                    }
                                                    if (!interpolateMax) {
                                                        interpolateMax = KDE.kernelDensityInterpolator(v.statistics.max, KDE.ELimit.max, kdeRoot);
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
                                        v.yVScale = d3.scale.linear()
                                            .range([
                                                0, 
                                                this.viewModel.violinPlot.width / 2
                                            ])
                                            .domain([0, d3.max<IDataPointKde>(v.dataKde, d => d.y)])
                                            .clamp(true);

                                    /** Now we have our scaling, we can generate the functions for each series */
                                        v.lineGen = d3.svg.line<IDataPointKde>()
                                            .interpolate(this.settings.violin.lineType)
                                            .x(d => this.viewModel.xVaxis.scale(d.x))
                                            .y(d => v.yVScale(d.y));
                                        v.areaGen = d3.svg.area<IDataPointKde>()
                                            .interpolate(this.settings.violin.lineType)
                                            .x(d => this.viewModel.xVaxis.scale(d.x))
                                            .y0(v.yVScale(0))
                                            .y1(d => v.yVScale(d.y));

                            });

                        /** This adjusts the domain of each axis to match any adjustments we made earlier on.
                         *  It's repeated code for now, so we should see if we can normalise later on when we clean up.
                         */
                            this.updateYDomain([yMin, yMax], debug);
                            this.resyncDimensions();
                            
                    }

                    /** We're done! */
                        debug.log('Finished doKde');
                        this.addDebugProfile(debug, 'doKde');
                        debug.footer();
                }

            /** Clears down the profiling data so that multiple updates don't accumulate */
                clearProfiling() {
                    if (this.viewModel.profiling) {
                        this.viewModel.profiling.categories = [];
                    }
                }

            /**
             * To make things more responsive, we need to repeatedly check the dimensions within the view model and apply particular changes and update other properties
             * as necessary. This function will do the necessary checks and balances to make sure that things resize correctly.
             */
                resyncDimensions() {

                    /** Set up debugging */
                        let debug = new VisualDebugger(this.debug);
                        debug.log('Syncing view model dimensions...');
                        debug.profileStart();

                    let xAxis = this.viewModel.xAxis,
                        yAxis = this.viewModel.yAxis;

                    /** X-axis height */
                        debug.log('X-axis vertical space...');
                        xAxis.titleDimensions = {
                            height:     this.settings.xAxis.show 
                                    &&  this.settings.xAxis.showTitle
                                    &&  xAxis.titleDisplayName 
                                    &&  !xAxis.titleDisplayName.collapsed 
                                    &&  xAxis.titleDisplayName.tailoredName !== ''
                                    &&  !xAxis.collapsed
                                ?   textMeasurementService.measureSvgTextHeight({
                                        fontSize: xAxis.titleDisplayName.textProperties.fontSize,
                                        fontFamily: xAxis.titleDisplayName.textProperties.fontFamily,
                                        text: xAxis.titleDisplayName.tailoredName
                                    })
                                :   0
                        };
                        debug.log(`X-axis title height: ${xAxis.titleDimensions.height}`);
                        xAxis.labelDimensions = {
                            height:     this.settings.xAxis.show 
                                    &&  this.viewModel.categoryNames 
                                    &&  this.settings.xAxis.showLabels 
                                    &&  !this.viewModel.categoriesAllCollapsed
                                    &&  !xAxis.collapsed
                                ?   textMeasurementService.measureSvgTextHeight(xAxis.labelTextProperties)
                                :   0
                        };
                        debug.log(`X-axis label height: ${xAxis.labelDimensions.height}`);
                        xAxis.dimensions = {
                            height:     xAxis.titleDimensions.height
                                    +   xAxis.labelDimensions.height
                                    +   (   this.settings.xAxis.show && this.viewModel.categoryNames && this.settings.xAxis.showLabels && !this.viewModel.categoriesAllCollapsed
                                                ?   xAxis.padding.top
                                                :   0
                                        )
                        };
                        debug.log(`X-axis total height: ${xAxis.dimensions.height}`);

                    /** Figure out how much vertical space we have for the y-axis and assign what we know currently */
                        debug.log('Y-Axis vertical space...');
                        yAxis.collapsed = false;
                        let yPadVert = this.settings.yAxis.fontSize / 2,
                            yHeight = this.viewport.height - yPadVert - xAxis.dimensions.height;
                            
                        /** Make adjustments to the x-axis if short on room to see if we can fre eup space. As a last resort, just say we can't render the axis */
                            if (yHeight < yAxis.heightLimit) {
                                if (xAxis.titleDimensions.height > 0) {
                                    debug.log('Reducing X-axis title to make room for Y-axis...');
                                    yHeight += xAxis.titleDimensions.height;
                                    xAxis.dimensions.height -= xAxis.titleDimensions.height;
                                    xAxis.titleDimensions.height = 0;
                                }
                            }
                            if (yHeight < yAxis.heightLimit && xAxis.titleDimensions.height == 0) {
                                if (xAxis.labelDimensions.height > 0) {
                                    debug.log('Reducing X-axis labels to make room for Y-axis...');
                                    yHeight += xAxis.labelDimensions.height;
                                    xAxis.labelDimensions.height = xAxis.dimensions.height = 0;
                                }
                            }
                            if (yHeight < yAxis.heightLimit && xAxis.dimensions.height == 0) {
                                debug.log('Y-axis too short to render properly!');
                                this.viewModel.yAxis.collapsed = true;
                            }
                            if (this.settings.yAxis.showTitle && yAxis.titleDisplayName && !yAxis.collapsed) {
                                debug.log('Re-checking and adjusting Y-axis title...');
                                yAxis.titleDisplayName = this.getTailoredDisplayName(
                                    yAxis.titleDisplayName.formattedName,
                                    yAxis.titleDisplayName.textProperties,
                                    yHeight
                                )
                            }

                        /** Providing that we managed to keep the Y-axis... */
                            if (!yAxis.collapsed) {
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
                                    this.settings.yAxis.showLabels
                                        ?   yAxis.labelFormatter.format(v)
                                        :   ''
                                ));
                
                                /** Resolve the title dimensions */
                                    debug.log('Y-Axis title sizing...');
                                    yAxis.titleDimensions = {
                                        width: (
                                                    this.settings.yAxis.show 
                                                &&  this.settings.yAxis.showTitle
                                                &&  yAxis.titleDisplayName 
                                                &&  !yAxis.titleDisplayName.collapsed 
                                                &&  yAxis.titleDisplayName.tailoredName !== ''
                                                &&  !yAxis.collapsed
                                            )
                                            ?   textMeasurementService.measureSvgTextHeight(yAxis.titleDisplayName.textProperties)
                                            :   0,
                                        height: yHeight,
                                        x: -yHeight / 2,
                                        y: 0
                                    };
                                    debug.log(`Y-axis title width: ${yAxis.titleDimensions.width}`);
                    
                                /** Find the widest label and use that for our Y-axis width overall */
                                    debug.log('Y-Axis label sizing...');
                                    yAxis.labelDimensions = {
                                        width:      this.settings.yAxis.show 
                                                &&  this.settings.yAxis.showLabels
                                                &&  !yAxis.collapsed
                                            ?   Math.max(
                                                    textMeasurementService.measureSvgTextWidth(yAxis.labelTextProperties, yAxis.ticksFormatted[0]),
                                                    textMeasurementService.measureSvgTextWidth(yAxis.labelTextProperties, yAxis.ticksFormatted[yAxis.ticksFormatted.length - 1])
                                                )
                                                + yAxis.padding.left
                                            : 0
                                        };
                                    debug.log(`Y-axis label width: ${yAxis.labelDimensions.width}`);
                    
                                /** Total Y-axis width */
                                    yAxis.dimensions.width = yAxis.labelDimensions.width + yAxis.titleDimensions.width;
                                    debug.log(`Y-axis total width: ${yAxis.dimensions.width}`);

                                /** Make adjustments to the width to compensate for smaller viewports
                                 *  TODO: very similar to x-axis code above; we can probably turn this into a function
                                 */
                                    let xWidth = this.viewport.width - yAxis.dimensions.width;
                                    if (xWidth < xAxis.widthLimit) {
                                        if (yAxis.titleDimensions.width > 0) {
                                            debug.log('Reducing X-axis title to make room for Y-axis...');
                                            xWidth += yAxis.titleDimensions.width;
                                            yAxis.dimensions.width -= yAxis.titleDimensions.width;
                                            yAxis.titleDimensions.width = 0;
                                        }
                                    }
                                    if (xWidth < xAxis.widthLimit && yAxis.titleDimensions.width == 0) {
                                        debug.log('Reducing Y-axis labels to make room for X-axis...');
                                        xWidth += yAxis.labelDimensions.width;
                                        yAxis.labelDimensions.width = yAxis.dimensions.width = 0;
                                    }
                                    if (xWidth < xAxis.widthLimit && yAxis.dimensions.width == 0) {
                                        debug.log('X-axis too narrow to render properly!');
                                        xAxis.collapsed = true;
                                    } else {
                                        xAxis.collapsed = false;
                                    }
                                    if (this.settings.xAxis.showTitle && xAxis.titleDisplayName) {
                                        debug.log('Re-checking and adjusting X-axis title...');
                                        xAxis.titleDisplayName = this.getTailoredDisplayName(
                                            xAxis.titleDisplayName.formattedName,
                                            xAxis.titleDisplayName.textProperties,
                                            xWidth
                                        )
                                    }
                                    
                                /** Solve the remaining axis dimensions */
                                    yAxis.dimensions.x = yAxis.titleDimensions.width;
                                    xAxis.dimensions.width = xWidth;
                                    xAxis.titleDimensions.x = yAxis.dimensions.width + (xAxis.dimensions.width / 2);
                                    xAxis.titleDimensions.y = this.viewport.height - xAxis.titleDimensions.height;

                                /** Revise Y-axis properties as necessary */
                                    debug.log('Y-Axis generator functions...');
                                    if (!yAxis.generator) {
                                        yAxis.generator = d3.svg.axis()
                                    }
                                    yAxis.generator
                                        .scale(yAxis.scale)
                                        .orient('left')
                                        .ticks(yAxis.ticks)
                                        .tickSize(-this.viewport.width + yAxis.dimensions.width)
                                        .tickFormat(d => this.settings.yAxis.showLabels && yAxis.labelDimensions.width > 0
                                            ?   yAxis.labelFormatter.format(d)
                                            :   ''
                                        );

                                /** Now we have y-axis width, do remaining x-axis width stuff */
                                    debug.log('X-Axis ticks and scale...');
                                    xAxis.range = [0, xAxis.dimensions.width];
                                    xAxis.scale = d3.scale.ordinal()
                                        .domain(xAxis.domain)
                                        .rangeRoundBands(xAxis.range);
                                    
                                    if (!xAxis.generator) {
                                        xAxis.generator = d3.svg.axis()
                                    };
                                    xAxis.generator    
                                        .scale(xAxis.scale)
                                        .orient('bottom')
                                        .tickSize(-yAxis.dimensions.height);

                                    /** Violin plot specifics */
                                        debug.log('Violin dimensions...');
                                        this.viewModel.violinPlot = {
                                            categoryWidth: xAxis.scale.rangeBand(),
                                            width: xAxis.scale.rangeBand() - (xAxis.scale.rangeBand() * (this.settings.violin.innerPadding / 100))
                                        } as IViolinPlot;
                                        
                                    /** Box plot specifics */
                                        debug.log('Box plot dimensions...');
                                        this.viewModel.boxPlot = {
                                            width: this.viewModel.violinPlot.width - (this.viewModel.violinPlot.width * (this.settings.dataPoints.innerPadding / 100)),
                                            maxMeanRadius: 3
                                        } as IBoxPlot;
                                        this.viewModel.boxPlot.maxMeanDiameter = this.viewModel.boxPlot.maxMeanRadius * 2;
                                        this.viewModel.boxPlot.scaledMeanRadius = (this.viewModel.boxPlot.width / 5);
                                        this.viewModel.boxPlot.scaledMeanDiameter = this.viewModel.boxPlot.scaledMeanRadius * 2;
                                        
                                        if (Math.min(this.viewModel.boxPlot.scaledMeanDiameter, this.viewModel.boxPlot.maxMeanDiameter) >= this.viewModel.boxPlot.width) {
                                            this.viewModel.boxPlot.actualMeanDiameter = 0
                                        } else {
                                            this.viewModel.boxPlot.actualMeanDiameter = this.viewModel.boxPlot.scaledMeanDiameter > this.viewModel.boxPlot.maxMeanDiameter
                                                ?   this.viewModel.boxPlot.maxMeanDiameter
                                                :   this.viewModel.boxPlot.scaledMeanDiameter
                                        }
                                        this.viewModel.boxPlot.actualMeanRadius = this.viewModel.boxPlot.actualMeanDiameter / 2;
                                        this.viewModel.boxPlot.xLeft = (this.viewModel.violinPlot.categoryWidth / 2) - (this.viewModel.boxPlot.width / 2);
                                        this.viewModel.boxPlot.xRight = (this.viewModel.violinPlot.categoryWidth / 2) + (this.viewModel.boxPlot.width / 2);

                                    /** Barcode plot specifics - a number of data points are similar to above but for now we'll keep separate for debugging purposes */
                                        debug.log('Barcode plot dimensions...');
                                        this.viewModel.barcodePlot = {
                                            width: this.viewModel.boxPlot.width,
                                            xLeft: this.viewModel.boxPlot.xLeft,
                                            xRight: this.viewModel.boxPlot.xRight
                                        };
                                        
                                if (this.viewModel.xVaxis && this.viewModel.xAxis.domain && this.viewModel.xVaxis.scale) {
                                    debug.log('Assigning xVaxis scale...');
                                    this.viewModel.xVaxis.scale
                                        .domain(this.viewModel.xVaxis.domain)
                                        .nice()
                                        .clamp(true);
                                }

                            }
                            
                        /** Transfer variables to view model */
                            if (this.viewModel && this.viewModel.yAxis) {
                                this.viewModel.yAxis = yAxis;
                            }
                            if (this.viewModel && this.viewModel.xAxis) {
                                this.viewModel.xAxis = xAxis;
                            }

                        debug.log('visualTransform complete');
                        this.addDebugProfile(debug, 'resyncDimensions');

                }

            /**
             * The y-axis can grow if the KDE calculations require it. This manages the update of both dependent axes (the main chart and the violin) in that particular
             * event.
             * 
             * @param domain                                    - [number, number] aray of min and max value
             * @param debug                                     - debugger to attach
             */
                updateYDomain(domain: [number, number], debug: VisualDebugger) {
                    debug.log(`Updating y-axis domain to [${domain}]`);
                    if (this.viewModel.yAxis) {
                        this.viewModel.yAxis.domain = domain;
                    }
                    if (this.viewModel.xVaxis) {
                        this.viewModel.xVaxis.domain = domain;
                    }
                }

            /**
             * Manages the formatting of the y-axis title, based on the value of the y-axis Title Style property.
             * 
             * @param debug 
             */
                formatYAxistitle(debug: VisualDebugger): string {

                    debug.log('Formatting y-axis title...');

                    /** If we supplied a title, use that, otherwise format our measure names */
                        let title = (!this.settings.yAxis.titleText) 
                            ? this.measureMetadata.displayName
                            : this.settings.yAxis.titleText;

                    /** Return the correct title based on our supplied settings */
                        debug.log(`Resolving title based on setting: ${this.settings.yAxis.titleStyle}`);
                        if (this.settings.yAxis.labelDisplayUnits == 1 || !this.viewModel.yAxis.labelFormatter.displayUnit) {
                            return title;
                        }
                        switch (this.settings.yAxis.titleStyle) {
                            case 'title': {
                                return title;
                            }
                            case 'unit': {
                                return this.viewModel.yAxis.labelFormatter.displayUnit.title;
                            }
                            case 'both': {
                                return `${title} (${this.viewModel.yAxis.labelFormatter.displayUnit.title})`;
                            }
                        }

                };

            /**
             * Calculate the necessary IDisplayName object for the supplied properties. Used to return a tailored value
             * (i.e. with ellipses) if the bounding width is not wide enough. An IDisplayName object is regarded as
             * `collapsed` if the tailored value is solely an ellipsis (`...`), which can then be used to determine
             * whether to display it at all based on other specific business logic.
             * 
             * @param formattedName                                 - The formatted string to evaluate
             * @param textProperties                                - The text properties to use when calculating dimensions
             * @param boundingWidth                                 - The width to test against
             */
                getTailoredDisplayName(formattedName: string, textProperties : TextProperties, boundingWidth): IDisplayName {
                    
                    let formattedWidth = textMeasurementService.measureSvgTextWidth(
                            textProperties,
                            formattedName
                        ),
                        tailoredName = formattedWidth > boundingWidth
                            ?   textMeasurementService.getTailoredTextOrDefault(
                                    textProperties,
                                    boundingWidth
                                )
                            :   formattedName,
                        tailoredWidth = formattedWidth > boundingWidth
                            ?   textMeasurementService.measureSvgTextWidth(
                                    textProperties,
                                    tailoredName
                                )
                            :   formattedWidth;
                        textProperties.text = formattedName;

                    return {
                        formattedName: formattedName,
                        formattedWidth: formattedWidth,
                        textProperties: textProperties,
                        tailoredName: tailoredName,
                        tailoredWidth: tailoredWidth,
                        collapsed: tailoredName == '...'
                    }

                }

        }

    }

}