module powerbi.extensibility.visual {

    import axisHelper = powerbi.extensibility.utils.chart.axis;
    import IAxisProperties = powerbi.extensibility.utils.chart.axis.IAxisProperties;
    import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;

    export module ViolinPlotModels {

        export interface IViewModel {
            categories: ICategory[];
            categoryNames: boolean;
            statistics: IStatistics;
            xAxis: IAxisCategorical;
            yAxis: IAxisLinear;
            xVaxis: IAxisLinear;
        }

        interface IAxis {
            ticks: number;
            tickSize: number;
            ticksFormatted: string[];
            generator: d3.svg.Axis;
            dimensions: IDimensions;
            titleTextProperties: TextProperties;
            titleDimensions: IDimensions;
            labelTextProperties: TextProperties;
            labelWidth: number;
            labelHeight: number;
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
            dataPoints: number[];
            dataKde: IDataPointKde[];
            lineGen: d3.svg.Line<IDataPointKde>;
            statistics: IStatistics;
            yVScale: d3.scale.Linear<number, number>;
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

    }

}