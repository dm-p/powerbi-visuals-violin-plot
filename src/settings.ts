/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    "use strict";
    import DataViewObjectsParser = powerbi.extensibility.utils.dataview.DataViewObjectsParser;

    let defaultFontSize: number = 11,
        defaultFontFamily: string = '"Segoe UI", wf_segoe-ui_normal, helvetica, arial, sans-serif',
        defaultFontColor: string = '#777777',
        defaultAxisFontColor: string = '#777777',
        defaultAxisGridlineColor: string = '#EAEAEA',
        defaultBoxFillColour: string = '#000000',
        defaultBoxDataColour: string = '#FFFFFF';
    

    export class VisualSettings extends DataViewObjectsParser {
        public yAxis: yAxisSettings = new yAxisSettings();
        public xAxis: xAxisSettings = new xAxisSettings();
        public violin: violinSettings = new violinSettings();
        public dataColours: dataColourSettings = new dataColourSettings();
        public boxPlot: boxPlotSetings = new boxPlotSetings();
        public tooltip: tooltipSettings = new tooltipSettings();
        public about: aboutSettings = new aboutSettings();
    }

    /** Common axis settings */
        export class axisSettings {
            /** Show whole axis */
            public show: boolean = true;
            /** Labels */
            public showLabels: boolean = true;
            /** Font color */
            public fontColor: string = defaultFontColor;
            /** Text Size */
            public fontSize: number = defaultFontSize;
            /** Font */
            public fontFamily: string = defaultFontFamily;
            /** Display Units */
            public labelDisplayUnits: number = 0;
            /** Precision */
            public precision: number = null;
            /** Show Title */
            public showTitle: boolean = false;
            /** Title Style */
            public titleStyle: string = 'title'
            /** Title Colour */
            public titleColor: string = defaultAxisFontColor;
            /** Title */
            public titleText: string = null;
            /** Title Text Size */
            public titleFontSize: number = defaultFontSize;
            /** Title Font */
            public titleFontFamily: string = defaultFontFamily;
            /** Gridlines Toggle */
            public gridlines: boolean = true;
            /** Gridline colour */
            public gridlineColor: string = defaultAxisGridlineColor;
            /** Gridline stroke width */
            public gridlineStrokeWidth: number = 1;
            /*8 Gridline line style */
            public gridlineStrokeLineStyle: string = 'solid';
        }

    /** Y-axis specific settings */
        export class yAxisSettings extends axisSettings {
            constructor() {
                super();
                this.gridlines = true;
            }
        }

    /** X-axis specific settings */
        export class xAxisSettings extends axisSettings {
            constructor() {
                super();
                this.gridlines = false;
            }
        }

    /** Used to hold violin settings */
    export class violinSettings {
        /** How far to pad the violin from the outside of the x-range band */
        public innerPadding: number = 20;
        /** How transparent the violin fill should be */
        public transparency: number = 40;
        /** Violin type - currently `line` only */
        public type: string = 'line';
        /** Violin line stroke width */
        public strokeWidth: number = 2;
        /** Clamp values to min/max or converge */
        public clamp: boolean = false;
        /** Line interpolation */
        public lineType: string = 'basis';
        /** Resolution to use when binning the violin plot */
        public resolution: string = '25';
        /** Kernel to use for line generation */
        public kernel: string = 'epanechnikov';
        /** Specify manual bandwidth */
        public specifyBandwidth: boolean = false;
        /** Manual bandwidth */
        public bandwidth: number = 10;
    }

    /** Used to manage violin colour configuration */
    export class dataColourSettings {
        /** Default colour for series */
        public defaultFillColour: string = null;
        /** Whether to colour by category or not */
        public colourByCategory: boolean = false;
    }

    /** Used to hold box plot settings */
    export class boxPlotSetings{
        /** Show box plot */
        public show: boolean = true;
        /** Box plot line stroke width */
        public strokeWidth: number = 2;
        /** Box fill colour */
        public boxFillColour: string = defaultBoxFillColour;
        /** How transparent the box plot fill should be */
        public transparency: number = 40;
        /** Width (as % of violin) */
        public innerPadding: number = 75;
        /** Whisker toggle */
        public showWhiskers: boolean = true;
        /** Median toggle */
        public showMedian: boolean = true;
        /** Median line colour */
        public medianFillColour: string = defaultBoxDataColour;
        /** Mean toggle */
        public showMean: boolean = true;
        /** Median circle colour */
        public meanFillColour: string = defaultBoxDataColour;
        /** Median circle inner colour */
        public meanFillColourInner: string = defaultBoxFillColour;
    }

    /** Used to hold tooltip settings */
    export class tooltipSettings {
        /** Show tooltips */
        public show: boolean = true;
        /** Precision */
        public precision: number = null;
        /** Individual statistics */
        public showMaxMin: boolean = true;
        public showSpan: boolean = false;
        public showMedian: boolean = true;
        public showMean: boolean = true;
        public showDeviation: boolean = true;
        public showQuartiles: boolean = false;
        public showIqr: boolean = false;
        public showConfidence: boolean = false;
        public showBandwidth: boolean = false;
    }

    /** Used to hold about info and manage debugging */
    export class aboutSettings {
        public visualName: string = 'Violin Plot';
        public version: string = '1.0.0';
        public debugMode: boolean = false;
        public debugVisualUpdate: boolean = false;
        public debugProperties: boolean = false;
        public development: boolean = true; /** SET TO false FOR RELEASE */
    }

}
