module powerbi.extensibility.visual {

    import axisHelper = powerbi.extensibility.utils.chart.axis;
    import IAxisProperties = powerbi.extensibility.utils.chart.axis.IAxisProperties;

    export module ViolinPlotModels {

        export interface IViewModel {
            categories: ICategory[];
            statistics: IStatistics;
            yAxis: axisHelper.IAxisProperties;
            xVaxis: axisHelper.IAxisProperties;
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