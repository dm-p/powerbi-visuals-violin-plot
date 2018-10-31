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

    let defaultFontSize: number = 11;
    let defaultFontFamily: string = '"Segoe UI", wf_segoe-ui_normal, helvetica, arial, sans-serif';
    let defaultFontColor: string = '#777777';
    let defaultAxisFontColor: string = '#777777';
    let defaultAxisGridlineColor: string = '#EAEAEA';

    export class VisualSettings extends DataViewObjectsParser {
        public yAxis: yAxisSettings = new yAxisSettings();
        public xAxis: xAxisSettings = new xAxisSettings();
        public violin: violinSettings = new violinSettings();
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
        /** Violin line stroke width */
        public strokeWidth: number = 2;
        /** how far to pad the violin from the outside of the x-range band */
        public innerPadding: number = 20;
        /** Violin type - currently `line` only */
        public type: string = 'line';
        /** Resolution to use when binning the violin plot */
        public resolution: string = '25';
        /** Kernel to use for line generation */
        public kernel: string = 'gaussian';
        /** Specify manual bandwidth */
        public specifyBandwidth: boolean = false;
        /** Manual bandwidth */
        public bandwidth: number = 10;
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
