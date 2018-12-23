module powerbi.extensibility.visual {

    import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;
    import IValueFormatter = powerbi.extensibility.utils.formatting.IValueFormatter;

    export module ViolinPlotModels {

            export interface IProfilerCategory {
                name: string;
                duration: number;
                startTime: number;
                endTime: number;
            }

            export interface IVisualProfiler {
                categories: IProfilerCategory[];
            }

        /**
         *  Used to bind individual data points (for non-box data plots)
         *  
         *  @property {number} value                            - Data point value
         *  @property {number} categoryIndex                    - Index of category that the value belongs to (used for looking up ICategory)
         */
            export interface IVisualDataPoint {
                value: number,
                categoryIndex: number
            }

        /**
         * View model for entire violin plot visual
         * 
         * @property {ICategory[]} categories                   - Category data and all necessary supporting objects and values
         * @property {boolean} categoryNames                    - Flag indicating whether category names are present (typically if the Category field well is not used)
         * @property {boolean} categoriesAllCollapsed           - Flag indicating if all categories have been collapsed (for responsiveness handling)
         * @property {boolean} categoriesReduced                - Flag that we reduced our categories to the limit in our settings, preventing the visual
         *                                                          from attempting to do KDE and plot on way too many (which is a massive performance hit)
         * @property {string} measure                           - Display name for measure
         * @property {IStatistics} statistics                   - Statistics across entire data set, irrespective of category
         * @property {IAxisCategorical} xAxis                   - X-axis (categorical) rendering
         * @property {IAxisLinear} yAxis                        - Y-axis (linear) rendering
         * @property {IAxisLinear} xVaxis                       - 'X'-axis used for rendering violin KDE plot
         * @property {IViolinPlot} violinPlot                   - Specifics for rendering a violin, outside other properties
         * @property {IBoxPlot} boxPlot                         - Specifics for rendering a box plot, outside other properties
         */
            export interface IViewModel {
                categories: ICategory[];
                categoryNames: boolean;
                categoriesAllCollapsed: boolean;
                categoriesReduced: boolean;
                measure: string;
                statistics: IStatistics;
                xAxis: IAxisCategorical;
                yAxis: IAxisLinear;
                xVaxis: IAxisLinear;
                violinPlot: IViolinPlot;
                boxPlot: IBoxPlot;
                barcodePlot: IBarcodePlot;
                profiling: IVisualProfiler;
            }

        /**
         * Specifics for plotting a violin that don't fit into the other view model properties
         * 
         * @property {number} categoryWidth                     - Derived width of each category, from x-axis (needed multiple times and easier to store here)
         * @property {number} width                             - Derived width of violin, based on `categoryWidth` and inner padding setting
         */
            export interface IViolinPlot {
                categoryWidth: number;
                width: number;
            }
        
        /**
         * Specifics for plotting a violin that don't fit into the other view model properties
         * 
         * @property {number} width                             - Dervied width of box plot, relative to `IViolinPlot` width and box plot inner padding setting
         * @property {number} scaledMeanRadius                  - Derived radius of the mean circle, based on the size of the box plot. Designed to not get too big if the visual 
         *                                                          size increases to large amounts, and also to handle responsvieness if the visual gets too small
         * @property {number} scaledMeanDiameter                - Derived diameter of the mean circle (basically `scaledMeanRadius * 2`); used for managing width of circle vs. 
         *                                                          the box plot
         * @property {number} maxMeanRadius                     - Specified value to cap radius at when rendering; used as a comparator for `actualMeanRadius` and
         *                                                           `scaledMeanRadius`
         * @property {number} maxMeanDiameter                   - Specified value to cap radius at when rendering; used as a comparator for `actualMeanDiameter` and
         *                                                           `scaledMeanDiameter`
         * @property {number} actualMeanRadius                  - The actual calculated radius of the mean circle, if we were not to restrict it. used to calculate
         *                                                          `scaledMeanRadius`
         * @property {number} actualMeanDiameter                - Essentially `actualMeanRadius * 2`; used for managing width of circle vs. the box plot
         * @property {number} xLeft                             - Calculated left x-coordinate of the box plot based on width calculations
         * @property {number} xRight                            - Calculated right x-coordinate of the box plot based on width calculations
         * @property {number} featureXLeft                      - Offset of `xLeft` to compensate for feature (median) widths
         * @property {number} featureXRight                     - Offset of `xRight` to compensate for feature (median) widths
         */
            export interface IBoxPlot {
                width: number;
                scaledMeanRadius: number;
                scaledMeanDiameter: number;
                maxMeanRadius: number;
                maxMeanDiameter: number;
                actualMeanRadius: number;
                actualMeanDiameter: number;
                xLeft: number;
                xRight: number;
                featureXLeft: number;
                featureXRight: number;
            }

        /**
         * Specifics for plotting a barcode combo plot within the violin
         * 
         * @property {number} width                             - Derived width of barcode plot, relative to `IViolinPlot` width and combo plot inner padding setting
         * @property {number} xLeft                             - Calculated left x-coordinate of the box plot based on width calculations
         * @property {number} xRight                            - Calculated right x-coordinate of the box plot based on width calculations
         * @property {number} featureXLeft                      - Offset of `xLeft` to compensate for feature (tooltip, quartile) widths
         * @property {number} featureXRight                     - Offset of `xRight` to compensate for feature (tooltip, quartile) widths
         * @property {number} tooltipWidth                      - Proportionally larger width than the `width` property. Used to make a data point stand out when displaying tooltip
         */
            export interface IBarcodePlot {
                width: number;
                xLeft: number;
                xRight: number;
                featureXLeft: number;
                featureXRight: number;
                tooltipWidth: number;
            }

        /**
         * Specific properties for managing the display of an axis with the visual
         * 
         * @property {boolean} collapsed                        - Indicates whether the axis is renderable or not based on the viewport dimensions
         * @property {number} widthLimit                        - Minimum pixel width required to correctly render the axis
         * @property {number} heightLimit                       - Minimum pixel height required to correctly render the axis
         * @property {number} ticks                             - The number of ticks to display
         * @property {number} tickSize                          - The pixel width/height required to display tick lines on the visual
         * @property {string[]} ticksFormatted                  - The formatted tick values for the axis, after applying any responsiveness handling and number 
         *                                                          formatting from the data model and/or visual settings
         * @property {d3.svg.Axis} generator                    - d3.js axis function required to render the axis
         * @property {IDimensions} dimensions                   - Computed dimensions of axis based on viewport, other axes visual settings
         * @property {IDimensions} labelDimensions              - Computed dimensions of axis labels based on viewport, other axes and visual settings
         * @property {IDimensions} titleDimensions              - Computed dimensions of axis title based on viewport, other axes and visual settings
         * @property {TextProperties} titleTextProperties       - Used to determine display of axis title, and compute size requirements
         * @property {IDisplayName} titleDisplayName            - Formatted/tailored title details, based on text properties and sizing
         * @property {IValueFormatter} labelFormatter           - Used to handle formatting of the axis labels, based on data model and visual settings
         * @property {IValueFormatter} titleFormatter           - Used to handle formatting of the axis title, based on data model and visual settings
         * @property {TextProperties} labelTextProperties       - Used to determine display of axis labels, and compute size requirements
         * @property {IPadding} padding                         - Any padding requirements for the axis
         */
            export interface IAxis {
                collapsed: boolean;
                widthLimit?: number;
                heightLimit?: number;
                ticks: number;
                tickSize: number;
                ticksFormatted: string[];
                generator: d3.svg.Axis;
                dimensions: IDimensions;
                labelDimensions: IDimensions;
                titleDimensions: IDimensions;
                titleTextProperties: TextProperties;
                titleDisplayName: IDisplayName;
                labelFormatter: IValueFormatter;
                titleFormatter: IValueFormatter;
                labelTextProperties: TextProperties;
                padding: IPadding;
            }

        /** 
         * Specific implementation of a linear axis within this visual
         * 
         * @extends IAxis
         * @property {[number, number]} domain                  - Min/max value of axis domain
         * @property {[number, number]} range                   - Min/max value of axis range
         * @property {d3.scale.Linear<number, number>}          - d3.js `scale` object used to render the axis
         */
            export interface IAxisLinear extends IAxis {
                domain: [number, number];
                range: [number, number];
                scale: d3.scale.Linear<number, number>;
            }

        /** 
         * Specific implementation of a categorical axis within this visual
         * 
         * @extends IAxis
         * @property {string[]} domain                          - All categorical values to include in the domain
         * @property {[number, number]} range                   - Min/max value of axis range
         * @property {d3.scale.Ordinal<string, number>}         - d3.js `scale` object used to render the axis
         */
            export interface IAxisCategorical extends IAxis {
                domain: string[];
                range: [number, number];
                scale: d3.scale.Ordinal<string, number>;
            }

        /**
         * Raw value and text properties for a chart axis
         * 
         * @property {number} value                             - Raw axis value
         * @property {TextProperties} textProperties            - Properties for value, including formatted value for supplied font configuration
         */
            export interface IAxisValue {
                value: number;
                textProperties: TextProperties;
            }        

        /**
         * Used to specify padding dimensions, where we want them in our view model
         * 
         * @property {number} bottom                            - Number of pixels to pad from bottom
         * @property {number} left                              - Number of pixels to pad from left
         * @property {number} right                             - Number of pixels to pad from right
         * @property {number} top                               - Number of pixels to pad from top
         */
            export interface IPadding {
                bottom?: number;
                left?: number;
                right?: number;
                top?: number;
            }

        /**
         * Used to specify dimensions and coordinates, where we want them in our view model
         * 
         * @property {number} width                             - Specified or calculated width of element
         * @property {number} height                            - Specified or calculated height of element
         * @property {number} x                                 - Specified or calculated x-coordinate of element
         * @property {number} y                                 - Specified or calculated y-coordinate of element
         */
            export interface IDimensions {
                width?: number;
                height?: number;
                x?: number;
                y?: number;
            }

        /**
         * Used to hold data to render a category within the visual
         * 
         * @property {string} name                              - Category name (unformatted & untailored)
         * @property {number} sortOrder                         - The order in which the category is added to the view model; allows us to 
         *                                                          ensure that we respect the 'sort by column' from the data model
         * @property {IDisplayName} displayName                 - The display name and/or tailored name of the category
         * @property {number} objectIndex                       - Position in the category array in the `dataView` in which the metadata
         *                                                          for visual settings or defaults should be stored (first instance)
         *                                                          TODO: we should probably set this all the way through when mapping
         *                                                          view model and properties to avoid issues with `fetchMoreData()` and
         *                                                          preserving the properties pane - see notes in `visual.ts`
         * @property {powerbi.visuals.ISelectionId} selectionId - Generated `ISelectionID` for category-specific settings in metadata
         * @property {number[]} dataPoints                      - All data points for the category in question
         * @property {IDataPointKde[]} dataKde                  - KDE processed data points for the category, according to visual settings
         * 
         * @property {d3.svg.Line<IDataPointKde>} lineGen       - Line generation function for category KDE plot
         * @property {d3.svg.Line<IDataPointKde>} areaGen       - Area generation function for category KDE plot
         * @property {IStatistics} statistics                   - Statistics across this category's data points
         * @property {d3.scale.Linear<number, number>} yVScale  - Specific Y-axis for the violin plot, as it works on a different orientation
         *                                                          to the overarching y-axis.
         */
            export interface ICategory {
                name: string;
                sortOrder: number;
                displayName: IDisplayName;
                objectIndex: number;
                colour: string;
                selectionId: powerbi.visuals.ISelectionId;
                dataPoints: number[];
                dataKde: IDataPointKde[];
                lineGen: d3.svg.Line<IDataPointKde>;
                areaGen: d3.svg.Area<IDataPointKde>;
                statistics: IStatistics;
                yVScale: d3.scale.Linear<number, number>;
            }

        /**
         * Used to manage the display/tailored name of a label or title (or other textual value)
         * 
         * @property {string} formattedName                     - Value with formatting applied from data model and/or visual settings
         * @property {number} formattedWidth                    - Computed width of `formattedName` value based on `textProperties`
         * @property {TextProperties} textProperties            - Text properties applied to value based on settings. used in calculating size requirements
         * @property {string} tailoredName                      - Value to display after any truncation based on dimension constraints
         * @property {number} tailoredWidth                     - Computed width of `tailoredName` value based on `textProperties`
         * @property {boolean} collapsed                        - Indicates that the value is completely unable to be displayed based on width constraints
         */
            export interface IDisplayName {
                formattedName: string;
                formattedWidth: number;
                textProperties?: TextProperties;
                tailoredName: string;
                tailoredWidth: number;
                collapsed: boolean;
            }

        /**
         * Used to hold statistical information about a category or the entire dataset
         * 
         * @property {number} min                               - Minimum value in data points
         * @property {number} confidenceLower                   - Calculated lower confidence value
         * @property {number} quartile1                         - Calculated first quartile value
         * @property {number} median                            - Median data point value
         * @property {number} mean                              - Mean data point value
         * @property {number} quartile3                         - Calculated third quartile value
         * @property {number} confidenceupper                   - Calculated upper confidence value
         * @property {number} max                               - Maximum value in data points
         * @property {number} deviation                         - Standard deviation of data points
         * @property {number} iqr                               - Inter quartile rane of data points
         * @property {number} span                              - Difference between max and min values
         * @property {number} bandwidthSilverman                - Silverman's rule-of-thumb bandwidth for data points
         * @property {number} bandwidthActual                   - Actual bandwidth applied to data points (may be manual)
         */
            export interface IStatistics {
                min: number;
                confidenceLower: number;
                quartile1: number;
                median: number;
                mean: number;
                quartile3: number;
                confidenceUpper: number;
                max: number;
                deviation: number;
                iqr: number;
                span: number;
                bandwidthSilverman: number;
                bandwidthActual: number;
            }

        /**
         * Represents a data point in the KDE calculations for a category
         * 
         * @property {number} x                                 - Calculated x-position of value for plotting
         * @property {number} y                                 - Calculated y-position of value for plotting
         * @property {boolean} remove                           - As we calculate KDE for each y-axis tick we add to our plot, this flags whether
         *                                                          we should remove the data point from our plot. This will be `true` for values
         *                                                          that fall outside the calculated min/max ranges for the violin plot once converged
         */
            export interface IDataPointKde {
                x: number;
                y: number;
                remove: boolean;
            }

        /** Used to specify side of the violin we're rendering, in order to reduce repeated code and manage position accordingly */
            export enum EViolinSide {
                left,
                right
            }

        /** Used to specify which whisker we're rendering, in order to reduce repeated code and manage position accordingly */
            export enum EBoxPlotWhisker {
                top,
                bottom
            }

        /** Used to specify the type of plot we're working with */
            export enum EComboPlotType {
                boxPlot,
                barcodePlot,
            }

        /** Used to specify the type of feature line we're going to render in our combo plot */
            export enum EFeatureLineType {
                median,
                quartile1,
                quartile3
            }

    }

}