module powerbi.extensibility.visual {

    import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;
    import IValueFormatter = powerbi.extensibility.utils.formatting.IValueFormatter;

    export module ViolinPlotModels {

        export interface IViewModel {
            categories: ICategory[];
            categoryNames: boolean;
            categoryCollapsedCount: number;
            categoriesAllCollapsed: boolean;
            statistics: IStatistics;
            xAxis: IAxisCategorical;
            yAxis: IAxisLinear;
            xVaxis: IAxisLinear;
            violinPlot: IViolinPlot;
            boxPlot: IBoxPlot;
        }

        export interface IViolinPlot {
            categoryWidth: number;
            width: number;
        }

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
        }

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
            labelTextProperties: TextProperties;
            padding: IPadding;
        }

        export interface IAxisLinear extends IAxis {
            domain: number[];
            range: number[];
            scale: d3.scale.Linear<number, number>;
        }

        export interface IAxisCategorical extends IAxis {
            domain: string[];
            range: [number, number];
            scale: d3.scale.Ordinal<string, number>;
        }

        /**
         * Raw value and text properties for a chart axis
         * 
         * @property {number} value                                     -   Raw axis value
         * @property {TextProperties} textProperties                    -   Properties for value, including formatted value for supplied font configuration
         */
        export interface IAxisValue {
            value: number;
            textProperties: TextProperties;
        }        

        export interface IPadding {
            bottom?: number;
            left?: number;
            right?: number;
            top?: number;
        }

        export interface IDimensions {
            width?: number;
            height?: number;
            x?: number;
            y?: number;
        }

        export interface ICategory {
            name: string;
            displayName: IDisplayName;
            colour: string;
            formatter: utils.formatting.IValueFormatter;
            selectionId: powerbi.visuals.ISelectionId;
            dataPoints: number[];
            dataKde: IDataPointKde[];
            lineGen: d3.svg.Line<IDataPointKde>;
            areaGen: d3.svg.Area<IDataPointKde>;
            statistics: IStatistics;
            yVScale: d3.scale.Linear<number, number>;
        }

        export interface IDisplayName {
            formattedName: string;
            formattedWidth: number;
            textProperties?: TextProperties;
            tailoredName: string;
            tailoredWidth: number;
            collapsed: boolean;
        }

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

        export interface IDataPointKde {
            x: number;
            y: number;
            remove: boolean;
        }

        export enum EViolinSide {
            left,
            right
        }

        export enum EBoxPlotWhisker {
            top,
            bottom
        }

        export enum EResizeOperation {
            
        }

    }

}