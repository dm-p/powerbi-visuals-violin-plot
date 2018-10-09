module powerbi.extensibility.visual {

    import axisHelper = powerbi.extensibility.utils.chart.axis;
    import IAxisProperties = powerbi.extensibility.utils.chart.axis.IAxisProperties;
    import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;

    export module ViolinPlotModels {

        export interface IViewModel {
            categories: ICategory[];
            statistics: IStatistics;
            xAxis: axisHelper.IAxisProperties;
            yAxis: IAxis;
            xVaxis: axisHelper.IAxisProperties;
        }

        export interface IAxis {
            axisProperties: IAxisProperties;
            labelTextProperties: TextProperties;
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
        }

        export interface IDataPointKde {
            x: number;
            y: number;
        }

    }

}