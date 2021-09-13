import { dataViewObjectsParser } from 'powerbi-visuals-utils-dataviewutils';
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;

import { visual } from '../pbiviz.json';

const defaultFontSize: number = 11,
    defaultFontSizeSmall: number = 8,
    defaultFontFamily: string =
        '"Segoe UI", wf_segoe-ui_normal, helvetica, arial, sans-serif',
    defaultFontColor: string = '#777777',
    defaultAxisFontColor: string = '#777777',
    defaultAxisGridlineColor: string = '#EAEAEA',
    defaultBoxFillColour: string = '#000000',
    defaultBoxDataColour: string = '#FFFFFF',
    defaultLineStyle: string = 'solid',
    defaultStrokeWidth: number = 2;

export class VisualSettings extends DataViewObjectsParser {
    public yAxis: YAxisSettings = new YAxisSettings();
    public xAxis: XAxisSettings = new XAxisSettings();
    public sorting: SortingSettings = new SortingSettings();
    public dataLimit: DataLimitSettings = new DataLimitSettings();
    public violin: ViolinSettings = new ViolinSettings();
    public dataColours: DataColourSettings = new DataColourSettings();
    public dataPoints: DataPointSettings = new DataPointSettings();
    public tooltip: TooltipSettings = new TooltipSettings();
    public legend: LegendSettings = new LegendSettings();
    public about: AboutSettings = new AboutSettings();
}

/**
 * Common axis settings
 */
export class AxisSettings {
    public show: boolean = true;
    public showLabels: boolean = true;
    public fontColor: string = defaultFontColor;
    public fontSize: number = defaultFontSize;
    public fontFamily: string = defaultFontFamily;
    public labelDisplayUnits: number = 0;
    public precision: number = null;
    public showTitle: boolean = false;
    public titleStyle: string = 'title';
    public titleColor: string = defaultAxisFontColor;
    public titleText: string = null;
    public titleFontSize: number = defaultFontSize;
    public titleFontFamily: string = defaultFontFamily;
    public gridlines: boolean = true;
    public gridlineColor: string = defaultAxisGridlineColor;
    public gridlineStrokeWidth: number = 1;
    public gridlineStrokeLineStyle: string = 'solid';
    public heightLimit: number;
    public widthLimit: number;
}

/**
 * Y-axis specific settings
 */
export class YAxisSettings extends AxisSettings {
    public start: number = null;
    public end: number = null;
    constructor() {
        super();
        this.gridlines = true;
        this.heightLimit = 55;
    }
}

/**
 * X-axis specific settings
 */
export class XAxisSettings extends AxisSettings {
    constructor() {
        super();
        this.gridlines = false;
        this.widthLimit = 55;
    }
}

/**
 * Used to hold violin settings
 */
export class ViolinSettings {
    public innerPadding: number = 20;
    public type: string = 'line'; // Not exposed
    public strokeWidth: number = defaultStrokeWidth;
    public clamp: boolean = false;
    public lineType: string = 'basis'; // Interpolation, not exposed
    public resolution: string = '25';
    public kernel: string = 'epanechnikov';
    public specifyBandwidth: boolean = false;
    public bandwidth: number = 10;
    public bandwidthByCategory: boolean = false;
}

/**
 * Used to manage violin colour configuration
 */
export class DataColourSettings {
    public defaultFillColour: string = null;
    public transparency: number = 40;
    public colourByCategory: boolean = false;
}

/**
 * Used to hold box plot settings
 */
export class DataPointSettings {
    public show: boolean = true;
    public plotType: string = 'boxPlot';
    public innerPadding: number = 75;
    public strokeWidth: number = defaultStrokeWidth;
    public boxFillColour: string = defaultBoxFillColour;
    public barColour: string = defaultBoxFillColour;
    public transparency: number = 40;
    public showWhiskers: boolean = true;
    public showQuartiles: boolean = false;
    public quartile1FillColour: string = defaultBoxDataColour;
    public quartile1StrokeWidth: number = defaultStrokeWidth;
    public quartile1StrokeLineStyle: string = 'dashed';
    public quartile3FillColour: string = defaultBoxDataColour;
    public quartile3StrokeWidth: number = defaultStrokeWidth;
    public quartile3StrokeLineStyle: string = 'dashed';
    public showMedian: boolean = true;
    public medianStrokeWidth: number = defaultStrokeWidth;
    public medianFillColour: string = defaultBoxDataColour;
    public medianStrokeLineStyle: string = defaultLineStyle;
    public showMean: boolean = true;
    public meanStrokeWidth: number = defaultStrokeWidth;
    public meanFillColour: string = defaultBoxDataColour;
    public meanFillColourInner: string = defaultBoxFillColour;
}

/**
 * Used to hold tooltip settings
 */
export class TooltipSettings {
    public show: boolean = true;
    public numberSamplesDisplayUnits: number = 0;
    public numberSamplesPrecision: number = 0;
    public measureDisplayUnits: number = 0;
    public measurePrecision: number = 2;
    // Individual statistics
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

/**
 * Manage the display of visual legend
 */
export class LegendSettings {
    public show: boolean = true;
    public position: string = 'Top';
    public showTitle: boolean = true;
    public titleText: string = null;
    public fontColor: string = defaultFontColor;
    public fontSize: number = defaultFontSizeSmall;
    public heightLimit: number = 75;
    public widthLimit: number = 75;
    public showCategories: boolean = true;
    public showStatisticalPoints: boolean = true;
    public spacerText: string = '    ';
    public dataPointText: string = 'Individual Data Point';
    public medianText: string = 'Median Value';
    public meanText: string = 'Mean Value';
    public quartileCombinedText: string = '1st & 3rd Quartiles';
    public quartile1Text: string = '1st Quartile';
    public quartile3Text: string = '3rd Quartile';
}

/**
 * Sorting of visual categories
 */
export class SortingSettings {
    public by: string = 'category';
    public order: string = 'ascending';
}

/**
 * Used to manage breaking of Data Limit and fetch more data
 */
export class DataLimitSettings {
    // Enable feature - currently off; refer to notes in visual.ts for details
    public enabled: boolean = false;
    public override: boolean = false;
    public showInfo: boolean = true;
    public showCustomVisualNotes: boolean = true;
    // Use to prevent the visual from rendering too many categories and breaking the browser
    public categoryLimit: number = 10;
}

/**
 * Used to hold about info and manage debugging
 */
export class AboutSettings {
    public visualName: string = visual.displayName;
    public version: string = visual.version;
    public debugMode: boolean = false;
    public debugVisualUpdate: boolean = false;
    public debugTooltipEvents: boolean = false;
    public debugProperties: boolean = false;
    public development: boolean = false; // SET TO `false` FOR RELEASE
    public usageUrl: string = visual.supportUrl;
}
