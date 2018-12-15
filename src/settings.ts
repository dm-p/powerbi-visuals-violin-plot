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
        defaultFontSizeSmall: number = 8,
        defaultFontFamily: string = '"Segoe UI", wf_segoe-ui_normal, helvetica, arial, sans-serif',
        defaultFontColor: string = '#777777',
        defaultAxisFontColor: string = '#777777',
        defaultAxisGridlineColor: string = '#EAEAEA',
        defaultBoxFillColour: string = '#000000',
        defaultBoxDataColour: string = '#FFFFFF';
    

    export class VisualSettings extends DataViewObjectsParser {
        public yAxis: yAxisSettings = new yAxisSettings();
        public xAxis: xAxisSettings = new xAxisSettings();
        public sorting: sortingSettings = new sortingSettings();
        public dataLimit: dataLimitSettings = new dataLimitSettings();
        public violin: violinSettings = new violinSettings();
        public dataColours: dataColourSettings = new dataColourSettings();
        public dataPoints: dataPointSettings = new dataPointSettings();
        public tooltip: tooltipSettings = new tooltipSettings();
        public legend: legendSettings = new legendSettings();
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
            /** Gridline line style */
            public gridlineStrokeLineStyle: string = 'solid';
            /** Height and width limit constants */
            public heightLimit: number;
            public widthLimit: number;
        }

    /** Y-axis specific settings */
        export class yAxisSettings extends axisSettings {
            constructor() {
                super();
                this.gridlines = true;
                this.heightLimit = 55;
            }
        }

    /** X-axis specific settings */
        export class xAxisSettings extends axisSettings {
            constructor() {
                super();
                this.gridlines = false;
                this.widthLimit = 55;
            }
        }

    /** Used to hold violin settings */
    export class violinSettings {
        /** How far to pad the violin from the outside of the x-range band */
        public innerPadding: number = 20;
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
        /** How transparent the violin fill should be */
        public transparency: number = 40;
        /** Whether to colour by category or not */
        public colourByCategory: boolean = false;
    }

    /** Used to hold box plot settings */
    export class dataPointSettings{
        /** Show data points */
        public show: boolean = true;
        /** Plot type */
        public plotType: string = 'boxPlot';
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

    /** Legend settings */
    export class legendSettings{
        /** Show legend */
        public show: boolean = true;
        /** Legend position */
        public position: string = 'Top';
        /** Show title */
        public showTitle: boolean = true;
        /** Title text */
        public titleText: string = null;
        /** Font color */
        public fontColor: string = defaultFontColor;
        /** Text Size */
        public fontSize: number = defaultFontSizeSmall;
        /** Height and width limit constants */
        public heightLimit: number = 75;
        public widthLimit: number = 75;
    }

    /** Sorting */
    export class sortingSettings {
        /** Sort by */
        public by: string = 'category';
        /** Sort order */
        public order: string = 'ascending';
    }

    /** Data Limit */
    export class dataLimitSettings {
        /** Enable feature - currently off; refer to notes in visual.ts for details */
        public enabled: boolean = false;
        public override: boolean = false;
        public showInfo: boolean = true;
        public showCustomVisualNotes: boolean = true;
        /** Use to prevent the visual from rendering too many categories and breaking the browser */
        public categoryLimit: number = 100;
    }

    /** Used to hold about info and manage debugging */
    export class aboutSettings {
        public visualName: string = 'Violin Plot';
        public version: string = '1.1.0.0';
        public debugMode: boolean = true;
        public debugVisualUpdate: boolean = false;
        public debugProperties: boolean = false;
        public development: boolean = false; /** SET TO `false` FOR RELEASE */
        public usageUrl: string = 'https://bitbucket.org/dm-p/power-bi-visuals-violin-plot/wiki/Usage%20and%20Visual%20Properties';
    }

}
