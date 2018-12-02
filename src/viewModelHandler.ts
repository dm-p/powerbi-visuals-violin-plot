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

        export class ViewModelHandler {

            viewModel: IViewModel;
            private allDataPoints: number[];
            debug: boolean;
            constructor() {
                this.viewModel = {} as IViewModel;
                this.debug = false;
            }

            /**
             * Populates the core data from the data view, meaning that if we don't need to re-do this (e.g. for resizes or other non-data-volatile
             * operations), then we can omit it.
             * 
             * @param options 
             * @param settings 
             * @param host 
             * @param colourPalette 
             */
                mapDataView(options: VisualUpdateOptions, settings: VisualSettings, host: IVisualHost, colourPalette: IColorPalette) {
                                
                    /** Set up debugging */
                        let debug = new VisualDebugger(this.debug);
                        debug.log('Starting mapDataView');
                        debug.log('Mapping data view to view model...'); 
                        debug.profileStart();

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
                            this.viewModel = viewModel;
                        }

                    /** Otherwise, let's get that data! */
                        debug.log('Data mapping conditions met. Proceeding with view model transform.');
                        let values = dataViews[0].categorical.values,
                            metadata = dataViews[0].metadata,
                            category = metadata.columns.filter(c => c.roles['category'])[0]
                                ?   dataViews[0].categorical.categories[0]
                                :   null,
                            categoryTextProperties = {
                                fontFamily: settings.xAxis.fontFamily,
                                fontSize: PixelConverter.toString(settings.xAxis.fontSize)
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
                                        textProperties: categoryTextProperties,
                                        formattedWidth: 0
                                    },
                                    colour: settings.dataColours.defaultFillColour,
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
                                            colour: settings.dataColours.colourByCategory
                                                ?   getCategoricalObjectValue<Fill>(
                                                        category,
                                                        v.objectIndex,
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
                                            .filter(c => c.name == `${category.values[i]}`)[0]
                                            .dataPoints.push(parseFloat(<string>v) ? Number(v) : null);
                                    });

                            }

                    /** We're done! */
                        this.viewModel = viewModel;
                        debug.log('Finished mapDataView');
                        debug.reportExecutionTime();
                        debug.footer();
                }

            /**
             * For the data that we have, calculate all necessary statistics we will need for drawing the plot
             */
                calculateStatistics(settings) {

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
                        if (settings.violin.type == 'line') {

                            debug.log('Instantiating KDE kernel and bandwidth settings...');
                            let kernel = {} as IKernel;
                        
                            /** Sigma function to account for outliers */
                                let bwSigma = Math.min(this.viewModel.statistics.deviation, this.viewModel.statistics.iqr / 1.349);
                                
                            /** Allocate the selected kernel from the properties pane */
                                debug.log(`Using ${settings.violin.kernel} kernel`);
                                kernel = KDE.kernels[settings.violin.kernel];

                            /** Because bandwidth is subjective, we use Silverman's rule-of-thumb to try and predict the bandwidth based on the spread of data.
                                 *  The use may wish to override this, so substitute for this if supplied. We'll keep the derived Silverman bandwidth for the user
                                 *  to obtain from the tooltip, should they wish to 
                                 */
                                this.viewModel.statistics.bandwidthSilverman = 
                                        kernel.factor 
                                    *   bwSigma 
                                    *   Math.pow(this.allDataPoints.length, -1/5);
                                this.viewModel.statistics.bandwidthActual = settings.violin.specifyBandwidth && settings.violin.bandwidth
                                    ?   settings.violin.bandwidth
                                    :   this.viewModel.statistics.bandwidthSilverman;

                        }

                    /** We're done! */
                        debug.log('Finished calculateStatistics');
                        debug.reportExecutionTime();
                        debug.footer();
                    
                }

            /** If we're sorting, sort the categories appropriately. 
             *  TODO: If we're sorting by name then we should respect the order they get added, as Power BI will provide us 
             *  the category already sorted by any manual columns in the data model
             * 
             *  @param settings 
             */
                sortData(settings) {

                    /** Set up debugging */
                        let debug = new VisualDebugger(this.debug);
                        debug.log('Starting sortData');
                        debug.log('Managing sorting based on preferences'); 
                        debug.profileStart();

                    /** Manage the sort */
                        if (this.viewModel.categoryNames) {
                            debug.log(`Sorting by ${settings.sorting.by}`);
                            this.viewModel.categories.sort((x, y) => {
                                switch (settings.sorting.by) {
                                    case 'category': {
                                        return d3[`${settings.sorting.order}`](x.name, y.name);
                                    }
                                    case 'samples': {
                                        return d3[`${settings.sorting.order}`](x.dataPoints.length, y.dataPoints.length);
                                    }
                                    case 'median':
                                    case 'mean':
                                    case 'min':
                                    case 'max': {
                                        return d3[`${settings.sorting.order}`](x.statistics[`${settings.sorting.by}`], y.statistics[`${settings.sorting.by}`]);
                                    }
                                }
                            });
                        }

                    /** We're done! */
                        debug.log('Finished sortData');
                        debug.reportExecutionTime();
                        debug.footer();
                }

        }

    }

}