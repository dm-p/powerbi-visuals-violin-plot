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
            import kernelDensityEstimator = KDE.kernelDensityEstimator;
            import kernelDensityRoot = KDE.kernelDensityRoot;
            import kernelDensityInterpolator = KDE.kernelDensityInterpolator;
            import ELimit = KDE.ELimit;

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
                this.viewModel = {} as IViewModel;
                this.debug = false;
            }

            /**
             * Populates the core data from the data view, meaning that if we don't need to re-do this (e.g. for resizes or other non-data-volatile
             * operations), then we can omit it.
             * 
             * @param options
             * @param host 
             * @param colourPalette 
             */
                mapDataView(options: VisualUpdateOptions, host: IVisualHost, colourPalette: IColorPalette) {
                                
                    /** Set up debugging */
                        let debug = new VisualDebugger(this.debug);
                        debug.log('Starting mapDataView');
                        debug.log('Mapping data view to view model...'); 
                        debug.profileStart();

                    let dataViews = options.dataViews;

                    /** Create bare-minimum view model */
                        let viewModel = {
                            profiling: {
                                categories: []
                            }
                        } as IViewModel;
    
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
                         *  Note that while it makes sense to put the category above the sampling from an analytical perspective, it actually creates blank values
                         *  for every unique sampling value under categories that do not contain it, and this ultimately blows up the granularity of the data
                         *  set significantly for even a few hundred rows. Byr grouping by sampling and then by category, we get the same number of rows as
                         *  there are in our base data. What this means is that we need to get the unique category values from the 'lower level' category in our
                         *  data view mapping and then assign our groupings once we know what they are.
                        */

                            /** Copy our values array and sort */
                                this.allDataPoints = <number[]>values[0].values
                                    .slice(0)
                                    .sort(d3.ascending);

                            if (!category) {
                                
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

                                /** Get unique category values */
                                    let distinctCategories = category.values.reduce(function(accum, current, idx) {
                                        if (!accum.filter(c => c.category == `${current}`)[0]) {
                                            accum.push({
                                                category: current,
                                                selectionId: host.createSelectionIdBuilder()
                                                    .withCategory(category, idx)
                                                    .createSelectionId(),
                                                objectIndex: idx
                                            });
                                        }
                                        return accum;
                                    }, []);
                                    
                                viewModel.categoryNames = true;

                                /** Create view model template */
                                    distinctCategories.map((v, i) => {                     
                                        let defaultColour: Fill = {
                                            solid: {
                                                color: colourPalette.getColor(v.category).value
                                            }
                                        }
                                        
                                        viewModel.categories.push({
                                            name: `${v.category}`,
                                            objectIndex: v.objectIndex,
                                            dataPoints: [],
                                            colour: this.settings.dataColours.colourByCategory
                                                ?   getCategoricalObjectValue<Fill>(
                                                        category,
                                                        v.objectIndex,
                                                        'dataColours',
                                                        'categoryFillColour',
                                                        defaultColour
                                                    ).solid.color
                                                :   this.settings.dataColours.defaultFillColour,
                                            selectionId: v.selectionId
                                        } as ICategory);
                                    });

                                /** Now we can put the values into the right categories */
                                    values[0].values.map((v, i) => {
                                        viewModel.categories
                                            .filter(c => c.name == `${category.values[i]}`)[0]
                                            .dataPoints.push(parseFloat(<string>v) ? Number(v) : null);
                                    });

                            }

                    /** We're done! */
                        this.viewModel = viewModel;
                        debug.log('Finished mapDataView');
                        this.addDebugProfile(debug, 'mapDataView');
                        debug.footer();
                }

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
                        this.viewModel.statistics = {
                            min: d3.min(this.allDataPoints),
                            max: d3.max(this.allDataPoints),
                            deviation: d3.deviation(this.allDataPoints),
                            iqr: d3.quantile(this.allDataPoints, 0.75) - d3.quantile(this.allDataPoints, 0.25),
                            span: d3.max(this.allDataPoints) - d3.min(this.allDataPoints)
                        } as IStatistics;

                    /** Process the remainder of the view model by category */
                        debug.log('Updating categories...');
                        this.viewModel.categories.map((c, i) => {
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

            /** If we're sorting, sort the categories appropriately. 
             *  TODO: If we're sorting by name then we should respect the order they get added, as Power BI will provide us 
             *  the category already sorted by any manual columns in the data model
             */
                sortData() {

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
                                        return d3[`${this.settings.sorting.order}`](x.name, y.name);
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
                        }

                    /** We're done! */
                        debug.log('Finished sortData');
                        this.addDebugProfile(debug, 'sortData');
                        debug.footer();
                }

            /**
             * 
             * @param options 
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
             * 
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
                                        this.viewModel.xAxis.collapsed = true;
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
                                            width: this.viewModel.violinPlot.width - (this.viewModel.violinPlot.width * (this.settings.boxPlot.innerPadding / 100)),
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
             * 
             * @param domain 
             * @param debug 
             */
                updateYDomain(domain: [number, number], debug: VisualDebugger) {
                    debug.log(`Updating y-axis domain to [${domain}]`);
                    this.viewModel.yAxis.domain = domain;
                }

            /**
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