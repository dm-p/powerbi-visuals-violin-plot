import powerbi from 'powerbi-visuals-api';
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IViewport = powerbi.IViewport;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import Fill = powerbi.Fill;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import {
    textMeasurementService,
    valueFormatter,
    interfaces
} from 'powerbi-visuals-utils-formattingutils';
import TextProperties = interfaces.TextProperties;
import { pixelConverter } from 'powerbi-visuals-utils-typeutils';
import { axis } from 'powerbi-visuals-utils-chartutils';

import * as d3 from 'd3';

import {
    IViewModel,
    ICategory,
    IViolinPlot,
    IBoxPlot,
    IStatistics,
    IDataPointKde,
    IAxisLinear,
    IAxisCategorical,
    IDisplayName,
    ILegend,
    IInterpolationExtents
} from './models';
import { getCategoricalObjectValue } from './visualHelpers';
import { defaultBandwidth, VisualSettings } from './settings';
import { VisualDebugger } from './visualDebugger';
import {
    IKernel,
    ELimit,
    kernelDensityInterpolator,
    kernelDensityRoot,
    kernelDensityEstimator,
    kernels
} from './kde';
import { getMetadataByRole, isNumberTruthy, shouldNotMapData } from './utils';

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
        this.viewModel = <IViewModel>{
            categoriesReduced: false,
            profiling: {
                categories: []
            },
            statistics: {}
        };
        this.debug = false;
    }

    /**
     * Populates the core data from the data view, meaning that if we don't need to re-do this (e.g. for resizes or other non-data-volatile
     * operations), then we can omit it.
     *
     * @param options                                   - visual update options
     * @param host                                      - visual host
     * @param colourPalette                             - visual colour palette object (for colour assignment to categories)
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
     *  If the array is filtered down to the `categoryLimit` value, we'll set a flag in the view model to alert the user.
     */
    mapDataView(
        options: VisualUpdateOptions,
        host: IVisualHost,
        colourPalette: ISandboxExtendedColorPalette
    ) {
        // Set up debugging
        let debug = new VisualDebugger(this.debug);
        debug.log('Starting mapDataView');
        debug.log('Mapping data view to view model...');
        debug.profileStart();

        const dataViews = options.dataViews;
        // Create bare-minimum view model
        let viewModel = this.viewModel;
        // Return this bare-minimum model if the conditions for our data view are not satisfied (basically don't draw the chart)
        if (shouldNotMapData(dataViews)) {
            debug.log('Conditions not met. Returning bare-minimum view model.');
            this.viewModel = viewModel;
        }

        // Otherwise, let's get that data!
        debug.log('Proceeding with view model transform.');
        const values = dataViews[0].categorical.values,
            metadata = dataViews[0].metadata;
        this.categoryMetadata = getMetadataByRole(metadata, 'category');
        this.measureMetadata = getMetadataByRole(metadata, 'measure');
        const category =
            (this.categoryMetadata && dataViews[0].categorical.categories[0]) ||
            null;
        this.categoryTextProperties = {
            fontFamily: this.settings.xAxis.fontFamily,
            fontSize: pixelConverter.toString(this.settings.xAxis.fontSize)
        };
        viewModel.measure = this.measureMetadata.displayName;
        viewModel.locale = host.locale;
        viewModel.categories = [];
        viewModel.dataViewMetadata = this.setDataViewMetadata();

        /** Create our allDatapoints array for later (as we only want to include datapoints that are in the final set after
         *  category reduction, if applicable) */
        this.allDataPoints = [];

        if (!category) {
            debug.log('Setting up single category for all data points...');
            this.allDataPoints = (<number[]>values[0].values).sort(
                d3.ascending
            );
            viewModel.categoryNames = false;
            viewModel.categories.push(this.getEmptyCategory(host));
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
                    value = <number>values[0].values[i];
                if (
                    !distinctCategories.find(c => c.name === `${categoryName}`)
                ) {
                    if (distinctCategoriesFound === distinctCategoryLimit) {
                        debug.log(`Limit of ${distinctCategoryLimit} reached.`);
                        this.viewModel.categoriesReduced = true;
                        break;
                    }
                    distinctCategoriesFound++;
                    // We need the colour palette default for this category, if it has not been explicitly set by the user
                    let defaultColour: Fill = {
                        solid: {
                            color: colourPalette.getColor(categoryName).value
                        }
                    };
                    // Create the initial display name here, so that we can use it in legends and later on when we do the tailoring
                    const formattedName = valueFormatter.format(
                        (this.categoryMetadata.type.dateTime &&
                            new Date(categoryName)) ||
                            (this.categoryMetadata.type.numeric &&
                                Number(categoryName)) ||
                            categoryName,
                        this.categoryMetadata.format
                    );
                    distinctCategories.push(
                        this.getDistinctCategory(
                            categoryName,
                            formattedName,
                            distinctCategoriesFound,
                            host,
                            category,
                            i,
                            defaultColour
                        )
                    );
                }
                // Add the value, to save us doing one iteration of a potentially large value array later on
                distinctCategories[distinctCategoriesFound - 1].dataPoints.push(
                    value
                );
                this.allDataPoints.push(value);
            }
            viewModel.categoryNames = true;
            // Create view model template
            debug.log(`${distinctCategoriesFound} categories.`);
            debug.log('Mapping distinct categories into view model...');
            viewModel.categories = distinctCategories;
        }
        // Add in the legend override properties now that we have the categories mapped
        viewModel.legend = this.getLegendData();
        // We're done!
        this.viewModel = viewModel;
        debug.log('Finished mapDataView');
        this.addDebugProfile(debug, 'mapDataView');
        debug.footer();
    }

    private setDataViewMetadata(): import('c:/Repos/powerbi-visuals-violin-plot/src/models').IDataViewMetadata {
        return {
            categoryDisplayName:
                (this.categoryMetadata && this.categoryMetadata.displayName) ||
                null,
            measureDisplayName:
                (this.measureMetadata.displayName &&
                    this.measureMetadata.displayName) ||
                null
        };
    }

    private getDistinctCategory(
        categoryName: string,
        formattedName: string,
        distinctCategoriesFound: number,
        host: IVisualHost,
        category: powerbi.DataViewCategoryColumn,
        i: number,
        defaultColour: powerbi.Fill
    ): ICategory {
        return <ICategory>{
            name: categoryName,
            displayName: {
                formattedName: formattedName
            },
            sortOrder: distinctCategoriesFound,
            selectionId: host
                .createSelectionIdBuilder()
                .withCategory(category, i)
                .createSelectionId(),
            objectIndex: i,
            dataPoints: [],
            colour: this.settings.dataColours.colourByCategory
                ? getCategoricalObjectValue<Fill>(
                      category,
                      i,
                      'dataColours',
                      'categoryFillColour',
                      defaultColour
                  ).solid.color
                : this.settings.dataColours.defaultFillColour
        };
    }

    private getEmptyCategory(host: IVisualHost): ICategory {
        return <ICategory>{
            name: '',
            displayName: {
                formattedName: '',
                textProperties: this.categoryTextProperties,
                formattedWidth: 0
            },
            colour: this.settings.dataColours.defaultFillColour,
            selectionId: host
                .createSelectionIdBuilder()
                .withMeasure(this.measureMetadata.queryName)
                .createSelectionId(),
            dataPoints: this.allDataPoints
        };
    }

    private getLegendData(): ILegend {
        return {
            boxColour:
                this.settings.dataPoints.plotType === 'barcodePlot'
                    ? this.viewModel.categories[0].colour
                    : this.settings.dataPoints.boxFillColour,
            boxOpacity:
                this.settings.dataPoints.plotType === 'barcodePlot'
                    ? 1 - this.settings.dataColours.transparency / 100
                    : 1 - this.settings.dataPoints.transparency / 100,
            quartilesMatch:
                this.settings.dataPoints.showQuartiles &&
                this.settings.dataPoints.quartile1StrokeLineStyle ===
                    this.settings.dataPoints.quartile3StrokeLineStyle &&
                this.settings.dataPoints.quartile1FillColour ===
                    this.settings.dataPoints.quartile3FillColour,
            quartileCombinedText:
                this.settings.legend.quartileCombinedText === ''
                    ? VisualSettings.getDefault()['legend'].quartileCombinedText
                    : this.settings.legend.quartileCombinedText,
            quartile1Text:
                this.settings.legend.quartile1Text === ''
                    ? VisualSettings.getDefault()['legend'].quartile1Text
                    : this.settings.legend.quartile1Text,
            quartile3Text:
                this.settings.legend.quartile3Text === ''
                    ? VisualSettings.getDefault()['legend'].quartile3Text
                    : this.settings.legend.quartile3Text,
            dataPointText:
                this.settings.legend.dataPointText === ''
                    ? VisualSettings.getDefault()['legend'].dataPointText
                    : this.settings.legend.dataPointText,
            meanText:
                this.settings.legend.meanText === ''
                    ? VisualSettings.getDefault()['legend'].meanText
                    : this.settings.legend.meanText,
            medianText:
                this.settings.legend.medianText === ''
                    ? VisualSettings.getDefault()['legend'].medianText
                    : this.settings.legend.medianText
        };
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
    calculateStatistics(options: VisualUpdateOptions) {
        // Set up debugging
        const debug = new VisualDebugger(this.debug);
        debug.log('Starting calculateStatistics');
        debug.log('Calculating statistics over view model data...');
        debug.profileStart();

        // Allocate the selected kernel from the properties pane
        debug.log(`Using ${this.settings.violin.kernel} kernel`);
        this.kernel = kernels[this.settings.violin.kernel];

        // All data points
        debug.log('All data points...');
        const statistics = this.getStatistics(this.allDataPoints);
        this.viewModel.statistics = {
            ...statistics,
            ...this.getBandwidthAllData(statistics, this.allDataPoints)
        };

        // Process the remainder of the view model by category
        debug.log('Updating categories...');
        const dataViews = options.dataViews,
            metadata = dataViews[0].metadata,
            category = metadata.columns.filter(c => c.roles['category'])[0]
                ? dataViews[0].categorical.categories[0]
                : null;

        this.viewModel.categories.map((c, i) => {
            c.dataPoints.sort(d3.ascending).filter(v => v !== null);

            /** Aggregate data points so that when we render individual values (like the barcode plot), we don't plot
             *  duplicate elements, but only if we're going to need them. Note that keys (the value) are coerced to strings
             *  by d3, so we'll need to consider that later on, when we need to display values in tooltips etc.
             */
            if (this.settings.dataPoints.plotType === 'barcodePlot') {
                c.dataPointsAgg = d3
                    .nest()
                    .key(d => d.toString())
                    .rollup(
                        v =>
                            <IStatistics>{
                                count: v.length
                            }
                    )
                    .entries(c.dataPoints)
                    .sort((x, y) => d3.ascending(Number(x.key), Number(y.key)));
            }
            const statistics = this.getStatistics(c.dataPoints);
            debug.log('Assigning category statistics...');
            c.statistics = {
                ...statistics,
                ...this.getBandwidthByCategory(
                    statistics,
                    c.dataPoints,
                    c.objectIndex,
                    category
                )
            };
        });

        // We're done!
        debug.log('Finished calculateStatistics');
        this.addDebugProfile(debug, 'calculateStatistics');
        debug.footer();
    }

    /**
     * Derive bandwidth based on Silverman's rule-of-thumb. We'll do this across all data points for now, as it produces some very
     * different ranges for individual series (which kind of makes sense when you're looking at potentially different sub-ranges of
     * data in groups). However, someone may wish to change that, and we will also calculate for individual categories elsewhere.
     *
     * Sources:
     *      - https://core.ac.uk/download/pdf/6591111.pdf
     *      - https://www.bauer.uh.edu/rsusmel/phd/ec1-26.pdf
     *      - https://en.wikipedia.org/wiki/Kernel_density_estimation#A_rule-of-thumb_bandwidth_estimator
     *      - https://stats.stackexchange.com/a/6671
     *      - https://www.ssc.wisc.edu/~bhansen/718/NonParametrics1.pdf
     *
     * Because bandwidth is subjective, we use Silverman's rule-of-thumb to try and predict the bandwidth based on the spread of data.
     * The use may wish to override this, so substitute for this if supplied. We'll keep the derived Silverman bandwidth for the user
     * to obtain from the tooltip, should they wish to.
     */
    private getBandwidthAllData(
        statistics: IStatistics,
        dataPoints: number[]
    ): Partial<IStatistics> {
        const bandwidthSilverman = this.calculateSilverman(
                statistics,
                dataPoints
            ),
            bandwidthActual =
                this.settings.violin.specifyBandwidth &&
                this.settings.violin.bandwidth
                    ? this.settings.violin.bandwidth
                    : bandwidthSilverman;
        return {
            bandwidthSilverman,
            bandwidthActual
        };
    }

    /**
     *  Derive category bandwidths based on settings:
     *   - If calculating bandwidth by category, calculate this based on data points
     *   - If using same bandwidth, just sub this in for KDE
     */
    private getBandwidthByCategory(
        statistics: IStatistics,
        dataPoints: number[],
        index: number,
        metadata: DataViewCategoryColumn
    ): Partial<IStatistics> {
        if (
            this.viewModel.categoryNames &&
            this.settings.violin.bandwidthByCategory
        ) {
            const catDefaultBw = this.settings.violin.bandwidth
                    ? this.settings.violin.bandwidth
                    : defaultBandwidth,
                bandwidthSilverman = this.calculateSilverman(
                    statistics,
                    dataPoints
                );
            return (
                (this.settings.violin.specifyBandwidth && {
                    bandwidthSilverman,
                    bandwidthActual:
                        (this.settings.violin.bandwidthByCategory &&
                            getCategoricalObjectValue(
                                metadata,
                                index,
                                'violin',
                                'categoryBandwidth',
                                catDefaultBw
                            )) ||
                        catDefaultBw
                }) || {
                    bandwidthSilverman,
                    bandwidthActual: bandwidthSilverman
                }
            );
        }
        return {
            bandwidthSilverman: this.viewModel.statistics.bandwidthSilverman,
            bandwidthActual: this.viewModel.statistics.bandwidthActual
        };
    }

    /**
     * Calculate the Silverman value for the supplied data.
     */
    private calculateSilverman(statistics: IStatistics, dataPoints: number[]) {
        return (
            this.kernel.factor *
            Math.min(statistics.deviation, statistics.iqr / 1.349) * // Sigma function to account for outliers
            Math.pow(dataPoints.length, -1 / 5)
        );
    }

    /**
     * For provided data points, calculate summary statistics from them.
     */
    private getStatistics(dataPoints: number[]) {
        const min = d3.min(dataPoints),
            max = d3.max(dataPoints),
            quartile1 = d3.quantile(dataPoints, 0.25),
            quartile3 = d3.quantile(dataPoints, 0.75);
        return <IStatistics>{
            count: dataPoints.length,
            min,
            max,
            deviation: d3.deviation(dataPoints),
            quartile1,
            quartile3,
            iqr: quartile3 - quartile1,
            span: max - min,
            confidenceLower: d3.quantile(dataPoints, 0.05),
            median: d3.median(dataPoints),
            mean: d3.mean(dataPoints),
            confidenceUpper: d3.quantile(dataPoints, 0.95)
        };
    }

    /**
     * If we're sorting, sort the categories appropriately.
     */
    sortAndFilterData() {
        // Set up debugging
        let debug = new VisualDebugger(this.debug);
        debug.log('Starting sortData');
        debug.log('Managing sorting based on preferences');
        debug.profileStart();

        // Manage the sort
        if (this.viewModel.categoryNames) {
            debug.log(`Sorting by ${this.settings.sorting.by}`);
            this.viewModel.categories.sort((x, y) => {
                switch (this.settings.sorting.by) {
                    case 'category': {
                        return d3[`${this.settings.sorting.order}`](
                            x.sortOrder,
                            y.sortOrder
                        );
                    }
                    case 'samples': {
                        return d3[`${this.settings.sorting.order}`](
                            x.dataPoints.length,
                            y.dataPoints.length
                        );
                    }
                    case 'median':
                    case 'mean':
                    case 'min':
                    case 'max': {
                        return d3[`${this.settings.sorting.order}`](
                            x.statistics[`${this.settings.sorting.by}`],
                            y.statistics[`${this.settings.sorting.by}`]
                        );
                    }
                }
            });
        } else {
            debug.log('No sorting required!');
        }

        // We're done!
        debug.log('Finished sortData');
        this.addDebugProfile(debug, 'sortData');
        debug.footer();
    }

    /**
     * Creates the bare-bones a and y axis objects in the view model.
     *
     * @param options                                   - visual update options
     */
    initialiseAxes() {
        // Set up debugging
        let debug = new VisualDebugger(this.debug);
        debug.log('Starting initialiseAxes');
        debug.log('Creating bare-minimum axis objects...');
        debug.profileStart();

        // Y-axis (initial)
        debug.log('Initial Y-Axis setup...');

        this.viewModel.yAxis = <IAxisLinear>{
            padding: {
                left: 5
            },
            heightLimit: this.settings.yAxis.heightLimit,
            labelTextProperties: {
                fontFamily: this.settings.yAxis.fontFamily,
                fontSize: pixelConverter.toString(this.settings.yAxis.fontSize)
            },
            labelFormatter: valueFormatter.create({
                format: this.measureMetadata.format,
                value:
                    this.settings.yAxis.labelDisplayUnits === 0
                        ? this.viewModel.statistics.max
                        : this.settings.yAxis.labelDisplayUnits,
                precision:
                    this.settings.yAxis.precision != null
                        ? this.settings.yAxis.precision
                        : null,
                cultureSelector: this.viewModel.locale
            })
        };

        // Initial domain based on view model statistics
        this.updateYDomain(
            [this.viewModel.statistics.min, this.viewModel.statistics.max],
            debug
        );

        // X-Axis (initial)
        debug.log('Initial X-Axis setup...');
        this.viewModel.xAxis = <IAxisCategorical>{
            padding: {
                top: 5
            },
            widthLimit: this.settings.xAxis.widthLimit,
            labelTextProperties: {
                fontFamily: this.settings.xAxis.fontFamily,
                fontSize: pixelConverter.toString(this.settings.xAxis.fontSize),
                text: this.viewModel.categories[0].name
            },
            domain: this.viewModel.categories.map(d => d.name)
        };

        // Add vertical X-axis properties
        debug.log('Cloning y-axis into vertical x-axis...');
        this.viewModel.xVaxis = this.viewModel.yAxis;

        // Initial sizing
        this.resyncDimensions();

        // We're done!
        debug.log('Finished initialiseAxes');
        this.addDebugProfile(debug, 'initialiseAxes');
        debug.footer();
    }

    /**
     * Set up the display of the axis title and labels, and manage any sizing calculations and re-draws as necessary.
     */
    processAxisText() {
        // Set up debugging
        let debug = new VisualDebugger(this.debug);
        debug.log('Starting processAxisText');
        debug.log('Calculating axis labels and titles');
        debug.profileStart();

        // Y-axis title
        this.viewModel.yAxis.titleTextProperties = {
            fontFamily: this.settings.yAxis.titleFontFamily,
            fontSize: pixelConverter.toString(
                this.settings.yAxis.titleFontSize
            ),
            text: this.formatYAxistitle(debug)
        };
        if (this.settings.yAxis.showTitle) {
            debug.log('Y-axis title initial setup...');
            this.viewModel.yAxis.titleDisplayName = this.yAxisTitleDisplayName();
        }

        // Resync if showing the axis at all
        if (this.settings.yAxis.show) {
            this.resyncDimensions();
        }

        // Manage the x-axis label/title and sizing
        debug.log('X-axis label and title sizing...');

        /** Manage display label overflow if required. By doing this, we can use the raw,
         *  unformatted category name to define our ticks, but format them correctly in the
         *  event of us wishing to use ellipses etc.
         *
         *  We'll work out the tailored name vs. the original name, and that way we can determine
         *  how many categories have been reduced to their ellipses. If all have been reduced then
         *  we can just remove the axis labels as they serve no purpose.
         */

        if (this.viewModel.categoryNames) {
            debug.log('X-axis labels...');
            let xTickMapper = {},
                collapsedCount = 0;

            this.viewModel.categories.map(c => {
                c.displayName = this.getTailoredDisplayName(
                    c.displayName.formattedName,
                    {
                        fontFamily: this.categoryTextProperties.fontFamily,
                        fontSize: this.categoryTextProperties.fontSize,
                        text: c.displayName.formattedName
                    },
                    this.viewModel.xAxis.scale
                        ? this.viewModel.xAxis.scale.rangeBand()
                        : this.viewport.width / this.viewModel.categories.length
                );

                collapsedCount += c.displayName.collapsed ? 1 : 0;

                xTickMapper[`${c.name}`] = c.displayName.tailoredName;
            });

            this.viewModel.categoriesAllCollapsed =
                collapsedCount === this.viewModel.categories.length;

            if (this.viewModel.xAxis.generator) {
                this.viewModel.xAxis.generator.tickFormat(d => {
                    // If all our ticks got collapsed, we might as well not have them...
                    if (
                        this.viewModel.categoriesAllCollapsed ||
                        !this.settings.xAxis.showLabels
                    ) {
                        return '';
                    } else {
                        return xTickMapper[d];
                    }
                });
            }
        } else {
            this.viewModel.xAxis.generator.tickFormat('');
        }

        // Repeat for the X-Axis title
        if (this.settings.xAxis.showTitle) {
            debug.log('X-axis title...');
            this.viewModel.xAxis.titleDisplayName = this.xAxisTitleDisplayName();
        }

        // Resync if showing the axis at all
        if (this.settings.xAxis.show) {
            this.resyncDimensions();
        }

        // We're done!
        debug.log('Finished processAxisText');
        this.addDebugProfile(debug, 'processAxisText');
        debug.footer();
    }

    /**
     * Do Kernel Density Estimator on the vertical X-axis, if we want to render a line for violin.
     */
    doKde() {
        // Set up debugging
        let debug = new VisualDebugger(this.debug);
        debug.log('Performing KDE on visual data...');
        debug.profileStart();

        if (
            this.settings.violin.type === 'line' &&
            !this.viewModel.yAxis.collapsed
        ) {
            // Keep track of the axis limits so that we can adjust them later if necessary
            let yMin = this.viewModel.yAxis.domain[0],
                yMax = this.viewModel.yAxis.domain[1];
            debug.log('Kernel Density Estimation...');

            // Map out KDE for each series (we might be able to do this in-line when we refactor the data mapping)
            this.viewModel.categories.map(c => {
                const series = c.name ? c.name : 'ALL';

                /** We'll need to return slightly different results based on whether we wish to clamp the data or converge it, so let's sort that out
                 *  Many thanks to Andrew Sielen's Block for inspiration on this (http://bl.ocks.org/asielen/92929960988a8935d907e39e60ea8417)
                 */
                let kdeData = this.getNewKDE(c.statistics.bandwidthActual)(
                        c.dataPoints
                    ),
                    interpolate = this.getInterpolationStage1(
                        c.statistics,
                        series,
                        debug
                    );
                if (!this.settings.violin.clamp) {
                    // Re-calc interpolation
                    interpolate = this.getRevisedConvergedInterpolation(
                        kdeData,
                        c.statistics,
                        c.dataPoints,
                        this.kernel,
                        this.viewModel.statistics.bandwidthActual,
                        series,
                        debug
                    );

                    // If our KDE value exceeds the y-axis domain, then we need to extend it to fit the plot.
                    if (
                        isNumberTruthy(interpolate.min) &&
                        interpolate.min < yMin
                    ) {
                        debug.log(
                            `[${series}] Interpolation exceeds y-axis minimum (currently ${yMin}). Reducing to ${interpolate.min}`
                        );
                        yMin = interpolate.min;
                    }
                    if (
                        isNumberTruthy(interpolate.max) &&
                        interpolate.max > yMax
                    ) {
                        debug.log(
                            `[${series}] Interpolation exceeds y-axis maximum (currently ${yMax}). Extending to ${interpolate.max}`
                        );
                        yMax = interpolate.max;
                    }
                    // We'll now re-process the array to ensure that we filter out the correct erroneous KDE values
                    const kdeProcessed = this.getAdjustedKdeData(
                        kdeData,
                        interpolate,
                        series,
                        debug
                    );
                    c.dataKde = kdeProcessed;
                } else {
                    c.dataKde = this.getClampedKdeData(
                        kdeData,
                        interpolate,
                        debug
                    );
                }
                // Adjust violin scale to account for inner padding preferences & generate SVG series functions
                c.yVScale = this.kdeVScale(c);
                c.lineGen = this.kdeLineGen(c);
                c.areaGen = this.kdeAreaGen(c);
                // Store the min/max interpolation points for use later on
                c.statistics.interpolateMin = interpolate.min;
                c.statistics.interpolateMax = interpolate.max;
            });

            /** This adjusts the domain of each axis to match any adjustments we made earlier on.
             *  It's repeated code for now, so we should see if we can normalise later on when we clean up.
             */
            this.updateYDomain([yMin, yMax], debug);
            this.resyncDimensions();
        }
        // We're done!
        debug.log('Finished doKde');
        this.addDebugProfile(debug, 'doKde');
        debug.footer();
    }

    private getRevisedConvergedInterpolation(
        kdeData: IDataPointKde[],
        statistics: IStatistics,
        dataPoints: number[],
        kernel: IKernel,
        bandwidth: number,
        series: string,
        debug: VisualDebugger
    ) {
        // Second phase - we try to converge the chart within the confines of the series min/max
        let interpolate = this.getInterpolationStage2(
            kdeData,
            statistics,
            series,
            debug
        );

        // Third phase - if either interpolation data point is still undefined then we run KDE over it until we find one, or run out of road and set one
        if (
            !isNumberTruthy(interpolate.min) ||
            !isNumberTruthy(interpolate.max)
        ) {
            interpolate = this.getInterpolationStage3(
                interpolate,
                statistics,
                dataPoints,
                kernel,
                bandwidth,
                series,
                debug
            );
        }
        return interpolate;
    }

    private getInterpolationStage1(
        statistics: IStatistics,
        series: string,
        debug: VisualDebugger
    ): IInterpolationExtents {
        const { min, max } = statistics;
        debug.log(
            `[${series}] Interpolation checkpoint #1 (min/max) - iMin: ${min}; sMin: ${min} iMax: ${max}; sMax: ${max}`
        );
        return {
            min,
            max
        };
    }

    private getInterpolationStage2(
        kdeData: IDataPointKde[],
        statistics: IStatistics,
        series: string,
        debug: VisualDebugger
    ): IInterpolationExtents {
        debug.log(
            `[${series}] Convergence required on violin plot. Doing further interpolation checks and processing...`
        );
        const min = d3.max(
                kdeData.filter(d => d.x < statistics.min && d.y === 0),
                d => d.x
            ),
            max = d3.min(
                kdeData.filter(d => d.x > statistics.max && d.y === 0),
                d => d.x
            );
        debug.log(
            `[${series}] Interpolation checkpoint #2 (filtering) - iMin: ${min}; sMin: ${statistics.min} iMax: ${max}; sMax: ${statistics.max}`
        );
        return { min, max };
    }

    private getInterpolationStage3(
        interpolate: IInterpolationExtents,
        statistics: IStatistics,
        dataPoints: number[],
        kernel: IKernel,
        bandwidth: number,
        series: string,
        debug: VisualDebugger
    ): IInterpolationExtents {
        debug.log(
            `[${series}] Couldn\'t converge following checkpoint #2. Applying further KDE to data to find a suitable point...`
        );
        let { min, max } = interpolate,
            kdeRoot = kernelDensityRoot(kernel.window, bandwidth, dataPoints);

        if (!isNumberTruthy(interpolate.min)) {
            min = kernelDensityInterpolator(
                statistics.min,
                ELimit.min,
                kdeRoot
            );
            debug.log(
                `[${series}] Applied KDE to minimum value. New value: ${min}`
            );
        }
        if (!isNumberTruthy(interpolate.max)) {
            max = kernelDensityInterpolator(
                statistics.max,
                ELimit.max,
                kdeRoot
            );
            debug.log(
                `[${series}] Applied KDE to maximum value. New value: ${max}`
            );
        }
        debug.log(
            `[${series}] Interpolation checkpoint #3 (KDE) - iMin: ${min}; sMin: ${statistics.min} iMax: ${max}; sMax: ${statistics.max}`
        );
        return { min, max };
    }

    private getAdjustedKdeData(
        kdeData: IDataPointKde[],
        interpolate: IInterpolationExtents,
        series: string,
        debug: VisualDebugger
    ) {
        /** Add an array element to the KDE if less than our original test ranges. Otherwise, set our lowest
         *  sample to zero to make it converge nicely (this is a bit hacky but prevents us from extending the axis
         *  if we don't really need to for these edge cases).
         */
        if (interpolate.min < kdeData[0].x) {
            debug.log(
                `[${series}] Interpolation minimum exceeds KDE values. Adding convergence point to start of KDE array.`
            );
            kdeData.unshift({
                x: interpolate.min,
                y: 0,
                remove: false
            });
        }

        /** Highest value is a little different, as it can exist somewhere before the end of the array, so we need
         *  to find the correct element in there to apply the convergence point.
         */
        if (interpolate.max > kdeData[kdeData.length - 1].x) {
            debug.log(
                `[${series}] Interpolation maximum exceeds KDE values. Adding convergence point to end of KDE array.`
            );
            kdeData.push({
                x: interpolate.max,
                y: 0,
                remove: false
            });
        }

        debug.log(
            `[${series}] Finding suitable KDE array min/max convergence points...`
        );
        let foundExtentMax = false,
            processedKde: IDataPointKde[] = [];

        kdeData.forEach((d, i) => {
            // Grab the current data point; we'll return it unprocessed if no conditions are hit
            let kdePoint: IDataPointKde = { ...d };

            // Converge anything outside of the min/max extents
            if (d.x <= interpolate.min || d.x >= interpolate.max) {
                kdePoint.y = 0;
            }

            // If we hit the minimum extent, then flag anything else that comes ahead of it, as we've already moved past them
            if (d.x < interpolate.min && kdeData[i + 1]?.x < interpolate.min) {
                kdePoint.remove = true;
            }

            // Deal with max extent
            if (d.x >= interpolate.max) {
                if (!foundExtentMax) {
                    foundExtentMax = true;
                } else {
                    kdePoint.remove = true;
                }
                kdePoint.y = 0;
            }

            processedKde.push(kdePoint);
        });
        // Filter out the data we don't need after processing it and we are go!
        return processedKde.filter(d => d.remove === false);
    }

    /**
     * If we want to clamp the KDE data, we add in a duplicate of the min/max elements with a zero y value for nice borders
     */
    private getClampedKdeData(
        kdeData: IDataPointKde[],
        interpolate: IInterpolationExtents,
        debug: VisualDebugger
    ) {
        const minBisect = d3.bisector((d: IDataPointKde) => d.x).left,
            maxBisect = d3.bisector((d: IDataPointKde) => d.x).right;
        let min = minBisect(kdeData, interpolate.min),
            max = maxBisect(kdeData, interpolate.max);

        debug.log(
            `Clamp splicing: min index = ${min}, max index = ${max}, total KDE bins = ${kdeData.length}`
        );

        // Add 2 max elements: the KDE plot value, and a 0 to converge
        debug.log('Resolving maximum values...');
        kdeData.splice(max, 0, {
            x: interpolate.max,
            y: kdeData[max > kdeData.length - 1 ? max - 1 : max].y,
            remove: false
        });
        kdeData.splice(max + 1, 0, {
            x: interpolate.max,
            y: 0,
            remove: false
        });

        // Add 2 min elements; similar to above
        debug.log('Resolving minimum values...');
        kdeData.splice(min, 0, {
            x: interpolate.min,
            y: kdeData[min === 0 ? 0 : min - 1].y,
            remove: false
        });
        kdeData.splice(min, 0, {
            x: interpolate.min,
            y: 0,
            remove: false
        });

        // Filter out anything outside our interpolation values
        debug.log('Filtering extents...');
        return kdeData
            .filter(d => d.x >= interpolate.min)
            .filter(d => d.x <= interpolate.max);
    }

    /**
     *  Through analysis, we can apply a scaling to the line based on the axis ticks, and a factor supplied by
     *  the resolution enum. Through some profiling with a few different sets of test data, the values in the enum
     *  seem to generate an array suitable enough to 'improve' the resolution of the line within the confines of the
     *  viewport sufficiently. There may well be a better way to do this, but it will suffice for now and makes the
     *  process sufficiently straightforward for the end-user...
     */
    private getNewKDE(bandwidth: number) {
        return kernelDensityEstimator(
            this.kernel.window,
            bandwidth,
            this.viewModel.xVaxis.scale.ticks(
                parseInt(this.settings.violin.resolution)
            )
        );
    }

    private kdeVScale(category: ICategory) {
        return d3.scale
            .linear()
            .range([0, this.viewModel.violinPlot.width / 2])
            .domain([0, d3.max<IDataPointKde>(category.dataKde, d => d.y)])
            .clamp(true);
    }

    private kdeLineGen(category: ICategory) {
        return d3.svg
            .line<IDataPointKde>()
            .interpolate(this.settings.violin.lineType)
            .x(d => this.viewModel.xVaxis.scale(d.x))
            .y(d => category.yVScale(d.y));
    }

    private kdeAreaGen(category: ICategory) {
        return d3.svg
            .area<IDataPointKde>()
            .interpolate(this.settings.violin.lineType)
            .x(d => this.viewModel.xVaxis.scale(d.x))
            .y0(category.yVScale(0))
            .y1(d => category.yVScale(d.y));
    }

    /**
     * Clears down the profiling data so that multiple updates don't accumulate
     */
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
        // Set up debugging
        let debug = new VisualDebugger(this.debug);
        debug.log('Syncing view model dimensions...');
        debug.profileStart();

        let xAxis = this.viewModel.xAxis,
            yAxis = this.viewModel.yAxis;

        // X-axis height
        debug.log('X-axis vertical space...');
        xAxis.titleDimensions = this.getXAxisTitleDimensions(xAxis);
        debug.log(`X-axis title height: ${xAxis.titleDimensions.height}`);
        xAxis.labelDimensions = this.getXAxisLabelDimensions(xAxis);
        debug.log(`X-axis label height: ${xAxis.labelDimensions.height}`);
        xAxis.dimensions = this.getXAxisDimensions(xAxis);
        debug.log(`X-axis total height: ${xAxis.dimensions.height}`);

        // Figure out how much vertical space we have for the y-axis and assign what we know currently
        debug.log('Y-Axis vertical space...');
        yAxis.collapsed = false;
        let yPadVert = this.settings.yAxis.fontSize / 2,
            yHeight = this.viewport.height - yPadVert - xAxis.dimensions.height;

        // Make adjustments to the x-axis if short on room to see if we can fre eup space. As a last resort, just say we can't render the axis
        if (yHeight < yAxis.heightLimit) {
            if (xAxis.titleDimensions.height > 0) {
                debug.log('Reducing X-axis title to make room for Y-axis...');
                yHeight += xAxis.titleDimensions.height;
                xAxis.dimensions.height -= xAxis.titleDimensions.height;
                xAxis.titleDimensions.height = 0;
            }
        }
        if (yHeight < yAxis.heightLimit && xAxis.titleDimensions.height === 0) {
            if (xAxis.labelDimensions.height > 0) {
                debug.log('Reducing X-axis labels to make room for Y-axis...');
                yHeight += xAxis.labelDimensions.height;
                xAxis.labelDimensions.height = xAxis.dimensions.height = 0;
            }
        }
        if (yHeight < yAxis.heightLimit && xAxis.dimensions.height === 0) {
            debug.log('Y-axis too short to render properly!');
            this.viewModel.yAxis.collapsed = true;
        }
        if (
            this.settings.yAxis.showTitle &&
            yAxis.titleDisplayName &&
            !yAxis.collapsed
        ) {
            debug.log('Re-checking and adjusting Y-axis title...');
            yAxis.titleDisplayName = this.getYAxisTitleName(yAxis, yHeight);
        }

        this.handeVisibleElementProperties(
            yAxis,
            yHeight,
            yPadVert,
            debug,
            xAxis
        );

        // Transfer variables to view model
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
     * Providing that we managed to keep the Y-axis, setup everything that we need to show the chart correctly
     */
    private handeVisibleElementProperties(
        yAxis: IAxisLinear,
        yHeight: number,
        yPadVert: number,
        debug: VisualDebugger,
        xAxis: IAxisCategorical
    ) {
        if (!yAxis.collapsed) {
            yAxis.dimensions = {
                height: yHeight,
                y: yPadVert
            };
            yAxis.range = [yAxis.dimensions.height, yAxis.dimensions.y];
            debug.log('Y-Axis ticks and scale...');
            yAxis.ticks = axis.getRecommendedNumberOfTicksForYAxis(
                yAxis.dimensions.height
            );
            yAxis.scale = this.setYAxisScale(yAxis);
            if (!(this.settings.yAxis.start || this.settings.yAxis.end)) {
                yAxis.scale.nice(yAxis.ticks);
            }
            yAxis.ticksFormatted = this.getYAxisFormattedTicks(yAxis);
            // Resolve the title dimensions
            debug.log('Y-Axis title sizing...');
            yAxis.titleDimensions = this.getYAxisTitleDimensions(
                yAxis,
                yHeight
            );
            debug.log(`Y-axis title width: ${yAxis.titleDimensions.width}`);
            // Find the widest label and use that for our Y-axis width overall
            debug.log('Y-Axis label sizing...');
            yAxis.labelDimensions = this.getYAxisLabelDimensions(yAxis);
            debug.log(`Y-axis label width: ${yAxis.labelDimensions.width}`);
            // Total Y-axis width
            yAxis.dimensions.width =
                yAxis.labelDimensions.width + yAxis.titleDimensions.width;
            debug.log(`Y-axis total width: ${yAxis.dimensions.width}`);
            // Make adjustments to the width to compensate for smaller viewports
            let xWidth = this.viewport.width - yAxis.dimensions.width;
            if (xWidth < xAxis.widthLimit) {
                if (yAxis.titleDimensions.width > 0) {
                    debug.log(
                        'Reducing X-axis title to make room for Y-axis...'
                    );
                    xWidth += yAxis.titleDimensions.width;
                    yAxis.dimensions.width -= yAxis.titleDimensions.width;
                    yAxis.titleDimensions.width = 0;
                }
            }
            if (
                xWidth < xAxis.widthLimit &&
                yAxis.titleDimensions.width === 0
            ) {
                debug.log('Reducing Y-axis labels to make room for X-axis...');
                xWidth += yAxis.labelDimensions.width;
                yAxis.labelDimensions.width = yAxis.dimensions.width = 0;
            }
            if (xWidth < xAxis.widthLimit && yAxis.dimensions.width === 0) {
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
                );
            }
            // Solve the remaining axis dimensions
            this.setFinalAxisDimensions(yAxis, xAxis, xWidth);
            // Revise Y-axis properties as necessary
            debug.log('Y-Axis generator functions...');
            if (!yAxis.generator) {
                yAxis.generator = d3.svg.axis();
            }
            this.setYAxisGenerator(yAxis);
            // Now we have y-axis width, do remaining x-axis width stuff
            debug.log('X-Axis ticks and scale...');
            xAxis.range = [0, xAxis.dimensions.width];
            this.setXAxisScale(xAxis);
            if (!xAxis.generator) {
                xAxis.generator = d3.svg.axis();
            }
            this.setXAxisGenerator(xAxis, yAxis);
            debug.log('Violin dimensions...');
            this.setViolinDimensions(xAxis);
            debug.log('Box plot dimensions...');
            this.setBoxPlotDimensions();
            debug.log('Ranged column plot dimensions...');
            this.setColumnPlotDimensions();
            debug.log('Barcode plot dimensions...');
            this.setBarcodePlotDimensions();
            if (
                this.viewModel.xVaxis &&
                this.viewModel.xAxis.domain &&
                this.viewModel.xVaxis.scale
            ) {
                debug.log('Assigning xVaxis scale...');
                this.setXVAxisScale();
            }
        }
    }

    private setFinalAxisDimensions(
        yAxis: IAxisLinear,
        xAxis: IAxisCategorical,
        xWidth: number
    ) {
        yAxis.dimensions.x = yAxis.titleDimensions.width;
        xAxis.dimensions.width = xWidth;
        xAxis.titleDimensions.x =
            yAxis.dimensions.width + xAxis.dimensions.width / 2;
        xAxis.titleDimensions.y =
            this.viewport.height - xAxis.titleDimensions.height;
    }

    private getYAxisFormattedTicks(yAxis: IAxisLinear): string[] {
        return yAxis.scale
            .ticks()
            .map(v =>
                this.settings.yAxis.showLabels
                    ? yAxis.labelFormatter.format(v)
                    : ''
            );
    }

    private setYAxisScale(yAxis: IAxisLinear): d3.scale.Linear<number, number> {
        return d3.scale
            .linear()
            .domain(yAxis.domain)
            .range(yAxis.range)
            .clamp(true);
    }

    private setXAxisScale(xAxis: IAxisCategorical) {
        xAxis.scale = d3.scale
            .ordinal()
            .domain(xAxis.domain)
            .rangeRoundBands(xAxis.range);
    }

    private setXAxisGenerator(xAxis: IAxisCategorical, yAxis: IAxisLinear) {
        xAxis.generator
            .scale(xAxis.scale)
            .orient('bottom')
            .tickSize(-yAxis.dimensions.height);
    }

    private setYAxisGenerator(yAxis: IAxisLinear) {
        yAxis.generator
            .scale(yAxis.scale)
            .orient('left')
            .ticks(yAxis.ticks)
            .tickSize(-this.viewport.width + yAxis.dimensions.width)
            .tickFormat(d =>
                this.settings.yAxis.showLabels &&
                yAxis.labelDimensions.width > 0
                    ? yAxis.labelFormatter.format(d)
                    : ''
            );
    }

    /**
     * Ranged column plot specifics - for now they are a copy of the box plot, as we're just changing the size to
     * use min/max rather than quartiles
     */
    private setColumnPlotDimensions() {
        this.viewModel.columnPlot = this.viewModel.boxPlot;
    }

    private setViolinDimensions(xAxis: IAxisCategorical) {
        this.viewModel.violinPlot = <IViolinPlot>{
            categoryWidth: xAxis.scale.rangeBand(),
            width:
                xAxis.scale.rangeBand() -
                xAxis.scale.rangeBand() *
                    (this.settings.violin.innerPadding / 100)
        };
    }

    private setXVAxisScale() {
        this.viewModel.xVaxis.scale
            .domain(this.viewModel.xVaxis.domain)
            .nice()
            .clamp(true);
    }

    /**
     * Barcode plot specifics - a number of data points are similar to above but for now we'll keep separate for
     * debugging purposes
     */
    private setBarcodePlotDimensions() {
        this.viewModel.barcodePlot = {
            width: this.viewModel.boxPlot.width,
            xLeft: this.viewModel.boxPlot.xLeft,
            xRight: this.viewModel.boxPlot.xRight,
            tooltipWidth: this.viewModel.boxPlot.width * 1.4,
            featureXLeft:
                this.viewModel.violinPlot.categoryWidth / 2 -
                (this.viewModel.boxPlot.width * 1.4) / 2,
            featureXRight:
                this.viewModel.violinPlot.categoryWidth / 2 +
                (this.viewModel.boxPlot.width * 1.4) / 2
        };
    }

    private setBoxPlotDimensions() {
        this.viewModel.boxPlot = <IBoxPlot>{
            width:
                this.viewModel.violinPlot.width -
                this.viewModel.violinPlot.width *
                    (this.settings.dataPoints.innerPadding / 100),
            maxMeanRadius: 3
        };
        this.viewModel.boxPlot.maxMeanDiameter =
            this.viewModel.boxPlot.maxMeanRadius * 2;
        this.viewModel.boxPlot.scaledMeanRadius =
            this.viewModel.boxPlot.width / 5;
        this.viewModel.boxPlot.scaledMeanDiameter =
            this.viewModel.boxPlot.scaledMeanRadius * 2;

        if (
            Math.min(
                this.viewModel.boxPlot.scaledMeanDiameter,
                this.viewModel.boxPlot.maxMeanDiameter
            ) >= this.viewModel.boxPlot.width
        ) {
            this.viewModel.boxPlot.actualMeanDiameter = 0;
        } else {
            this.viewModel.boxPlot.actualMeanDiameter =
                this.viewModel.boxPlot.scaledMeanDiameter >
                this.viewModel.boxPlot.maxMeanDiameter
                    ? this.viewModel.boxPlot.maxMeanDiameter
                    : this.viewModel.boxPlot.scaledMeanDiameter;
        }
        this.viewModel.boxPlot.actualMeanRadius =
            this.viewModel.boxPlot.actualMeanDiameter / 2;
        this.viewModel.boxPlot.xLeft =
            this.viewModel.violinPlot.categoryWidth / 2 -
            this.viewModel.boxPlot.width / 2;
        this.viewModel.boxPlot.xRight =
            this.viewModel.violinPlot.categoryWidth / 2 +
            this.viewModel.boxPlot.width / 2;
        this.viewModel.boxPlot.featureXLeft =
            this.viewModel.boxPlot.xLeft +
            this.settings.dataPoints.strokeWidth / 2;
        this.viewModel.boxPlot.featureXRight =
            this.viewModel.boxPlot.xRight -
            this.settings.dataPoints.strokeWidth / 2;
    }

    private getYAxisTitleName(
        yAxis: IAxisLinear,
        yHeight: number
    ): IDisplayName {
        return this.getTailoredDisplayName(
            yAxis.titleDisplayName.formattedName,
            yAxis.titleDisplayName.textProperties,
            yHeight
        );
    }

    private getYAxisLabelDimensions(
        yAxis: IAxisLinear
    ): import('c:/Repos/powerbi-visuals-violin-plot/src/models').IDimensions {
        return {
            width:
                this.settings.yAxis.show &&
                this.settings.yAxis.showLabels &&
                !yAxis.collapsed
                    ? Math.max(
                          textMeasurementService.measureSvgTextWidth(
                              yAxis.labelTextProperties,
                              yAxis.ticksFormatted[0]
                          ),
                          textMeasurementService.measureSvgTextWidth(
                              yAxis.labelTextProperties,
                              yAxis.ticksFormatted[
                                  yAxis.ticksFormatted.length - 1
                              ]
                          )
                      ) + yAxis.padding.left
                    : 0
        };
    }

    private getYAxisTitleDimensions(
        yAxis: IAxisLinear,
        yHeight: number
    ): import('c:/Repos/powerbi-visuals-violin-plot/src/models').IDimensions {
        return {
            width:
                this.settings.yAxis.show &&
                this.settings.yAxis.showTitle &&
                yAxis.titleDisplayName &&
                !yAxis.titleDisplayName.collapsed &&
                yAxis.titleDisplayName.tailoredName !== '' &&
                !yAxis.collapsed
                    ? textMeasurementService.measureSvgTextHeight(
                          yAxis.titleDisplayName.textProperties
                      )
                    : 0,
            height: yHeight,
            x: -yHeight / 2,
            y: 0
        };
    }

    private getXAxisDimensions(
        xAxis: IAxisCategorical
    ): import('c:/Repos/powerbi-visuals-violin-plot/src/models').IDimensions {
        return {
            height:
                xAxis.titleDimensions.height +
                xAxis.labelDimensions.height +
                (this.settings.xAxis.show &&
                this.viewModel.categoryNames &&
                this.settings.xAxis.showLabels &&
                !this.viewModel.categoriesAllCollapsed
                    ? xAxis.padding.top
                    : 0)
        };
    }

    private getXAxisLabelDimensions(
        xAxis: IAxisCategorical
    ): import('c:/Repos/powerbi-visuals-violin-plot/src/models').IDimensions {
        return {
            height:
                this.settings.xAxis.show &&
                this.viewModel.categoryNames &&
                this.settings.xAxis.showLabels &&
                !this.viewModel.categoriesAllCollapsed &&
                !xAxis.collapsed
                    ? textMeasurementService.measureSvgTextHeight(
                          xAxis.labelTextProperties
                      )
                    : 0
        };
    }

    private getXAxisTitleDimensions(
        xAxis: IAxisCategorical
    ): import('c:/Repos/powerbi-visuals-violin-plot/src/models').IDimensions {
        return {
            height:
                this.settings.xAxis.show &&
                this.settings.xAxis.showTitle &&
                xAxis.titleDisplayName &&
                !xAxis.titleDisplayName.collapsed &&
                xAxis.titleDisplayName.tailoredName !== '' &&
                !xAxis.collapsed
                    ? textMeasurementService.measureSvgTextHeight({
                          fontSize:
                              xAxis.titleDisplayName.textProperties.fontSize,
                          fontFamily:
                              xAxis.titleDisplayName.textProperties.fontFamily,
                          text: xAxis.titleDisplayName.tailoredName
                      })
                    : 0
        };
    }

    /**
     * The y-axis can grow if the KDE calculations require it. This manages the update of both dependent axes (the main chart and the violin) in that particular
     * event. Also ensure that any user override of the start/end y-axis values is catered for.
     *
     * @param domain                                    - [number, number] aray of min and max value
     * @param debug                                     - debugger to attach
     */
    updateYDomain(domain: [number, number], debug: VisualDebugger) {
        // If the user has supplied their own start/end values, use those
        domain = [
            this.settings.yAxis.start === 0
                ? 0
                : this.settings.yAxis.start || domain[0],
            this.settings.yAxis.end === 0
                ? 0
                : this.settings.yAxis.end || domain[1]
        ];

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

        // If we supplied a title, use that, otherwise format our measure names
        let title = !this.settings.yAxis.titleText
            ? this.measureMetadata.displayName
            : this.settings.yAxis.titleText;

        // Return the correct title based on our supplied settings
        debug.log(
            `Resolving title based on setting: ${this.settings.yAxis.titleStyle}`
        );
        if (
            this.settings.yAxis.labelDisplayUnits === 1 ||
            !this.viewModel.yAxis.labelFormatter.displayUnit
        ) {
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
    }

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
    getTailoredDisplayName(
        formattedName: string,
        textProperties: TextProperties,
        boundingWidth
    ): IDisplayName {
        let formattedWidth = textMeasurementService.measureSvgTextWidth(
                textProperties,
                formattedName
            ),
            tailoredName =
                formattedWidth > boundingWidth
                    ? textMeasurementService.getTailoredTextOrDefault(
                          textProperties,
                          boundingWidth
                      )
                    : formattedName,
            tailoredWidth =
                formattedWidth > boundingWidth
                    ? textMeasurementService.measureSvgTextWidth(
                          textProperties,
                          tailoredName
                      )
                    : formattedWidth;
        textProperties.text = formattedName;

        return {
            formattedName: formattedName,
            formattedWidth: formattedWidth,
            textProperties: textProperties,
            tailoredName: tailoredName,
            tailoredWidth: tailoredWidth,
            collapsed: tailoredName === '...'
        };
    }

    private yAxisTitleDisplayName = () =>
        this.getTailoredDisplayName(
            this.viewModel.yAxis.titleTextProperties.text,
            this.viewModel.yAxis.titleTextProperties,
            this.viewModel.yAxis.dimensions
                ? this.viewModel.yAxis.dimensions.height
                : this.viewport.height
        );

    private xAxisTitleDisplayName(): IDisplayName {
        return this.getTailoredDisplayName(
            this.getXAxisTitleFormatted(),
            {
                fontFamily: this.settings.xAxis.titleFontFamily,
                fontSize: pixelConverter.toString(
                    this.settings.xAxis.titleFontSize
                ),
                text: this.getXAxisTitleFormatted()
            },
            this.viewModel.xAxis.dimensions.width
        );
    }

    private getXAxisTitleFormatted() {
        return !this.categoryMetadata
            ? ''
            : (!this.settings.xAxis.titleText
                  ? this.categoryMetadata.displayName
                  : this.settings.xAxis.titleText
              ).trim();
    }
}
