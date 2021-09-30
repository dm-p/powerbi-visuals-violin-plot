import powerbi from 'powerbi-visuals-api';
import IViewport = powerbi.IViewport;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import { legend, legendInterfaces } from 'powerbi-visuals-utils-chartutils';
import ILegend = legendInterfaces.ILegend;
import LegendPosition = legendInterfaces.LegendPosition;
import LegendData = legendInterfaces.LegendData;
import MarkerShape = legendInterfaces.MarkerShape;
import ISelectionId = powerbi.extensibility.ISelectionId;
import positionChartArea = legend.positionChartArea;

import * as d3 from 'd3';

import { VisualDebugger } from './visualDebugger';
import { DataPointSettings, LegendSettings, VisualSettings } from './settings';
import { IViewModel, ILegend as IVMLegend } from './models';
import { LegendDataPoint } from 'powerbi-visuals-utils-chartutils/lib/legend/legendInterfaces';

const itemRadius = 5,
    boxStrokeWidth = 1,
    lineStrokeWidth = 2,
    customIconClass = 'customLegendIcon',
    defaultFillColour = '#000000';

export class ViolinLegend {
    public legend: ILegend;
    public newViewport: IViewport;
    private errorState: boolean;
    private position: LegendPosition;
    private data: LegendData;
    public debug: VisualDebugger;
    private container: d3.Selection<{}>;
    private viewModel: IViewModel;
    private settings: VisualSettings;
    private host: IVisualHost;

    constructor(
        errorState: boolean,
        container: d3.Selection<{}>,
        legend: ILegend,
        viewport: IViewport,
        viewModel: IViewModel,
        settings: VisualSettings,
        host: IVisualHost
    ) {
        this.errorState = errorState;
        this.container = container;
        this.legend = legend;
        this.viewModel = viewModel;
        this.newViewport = viewport;
        this.settings = settings;
        this.host = host;
        this.debug = new VisualDebugger(settings.about.debugMode && settings.about.debugVisualUpdate);
    }

    /**
     *  Workflow to fully render the legend for the visual
     */
    renderLegend() {
        this.debug.log('Creating and rendering legend...');
        this.constructLegendData();
        this.positionLegend();
        this.drawLegend();
        this.fixLegendIcons();
        this.fixViewportForLegend();
    }

    /**
     *  Build the `LegendData` for the visual. We previously used to do this if there were multiple category values, and the user
     *  had specified to colour by category. We had some feedback (#65) that showed it would be good to include the additional
     *  annotations to the violin (median, mean, quartiles & data points), so we artifically create these here and then do some
     *  post-processing on these afterwards.
     *
     *  @param viewModel                                - View model object to use for processing
     *  @param settings                                 - Settings object to use for processing
     *  @param host                                     - Visual host
     */
    private constructLegendData() {
        const measureOnly = !this.viewModel?.categoryNames || !this.settings.dataColours.colourByCategory,
            { dataPoints, legend } = this.settings,
            { showStatisticalPoints } = legend,
            { quartilesMatch } = !this.errorState && this.viewModel?.legend,
            measureId =
                !this.errorState &&
                this.host
                    .createSelectionIdBuilder()
                    .withMeasure(this.viewModel.measure)
                    .createSelectionId();

        this.debug.log('Creating legend data...');

        // Instantiate bare-minimum legend data. This will get cleaned up afterwards.
        this.data = {
            title: this.getTitleText(legend, measureOnly),
            fontSize: legend.fontSize,
            labelColor: legend.fontColor,
            dataPoints:
                (!this.errorState &&
                    dataPoints.show && [
                        // Individual category
                        ...getLegendDataPoint(
                            legend.showCategories && measureOnly,
                            this.viewModel.dataViewMetadata.measureDisplayName,
                            this.viewModel.categories[0].selectionId,
                            this.settings.dataColours.defaultFillColour
                        ),
                        ...(this.viewModel.categories
                            .map(c =>
                                getLegendDataPoint(!measureOnly, c.displayName.formattedName, c.selectionId, c.colour)
                            )
                            .flat() || []),
                        // Spacer
                        ...getLegendDataPoint(
                            showStatisticalPoints && legend.showCategories,
                            this.settings.legend.spacerText,
                            measureId
                        ),
                        // Data points
                        ...getLegendDataPoint(
                            showStatisticalPoints && dataPoints.plotType === 'barcodePlot',
                            legend.dataPointText,
                            measureId
                        ),
                        // Combined quartiles
                        ...getLegendDataPoint(
                            showStatisticalPoints &&
                                dataPoints.showQuartiles &&
                                quartilesMatch &&
                                dataPoints.plotType !== 'boxPlot',
                            legend.quartileCombinedText,
                            measureId
                        ),
                        // 1st Quartile (if not matching)
                        ...getLegendDataPoint(
                            showStatisticalPoints &&
                                dataPoints.showQuartiles &&
                                !quartilesMatch &&
                                dataPoints.plotType !== 'boxPlot',
                            legend.quartile1Text,
                            measureId
                        ),
                        // 3rd Quartile (if not matching)
                        ...getLegendDataPoint(
                            showStatisticalPoints &&
                                dataPoints.showQuartiles &&
                                !quartilesMatch &&
                                dataPoints.plotType !== 'boxPlot',
                            legend.quartile3Text,
                            measureId
                        ),
                        // Median
                        ...getLegendDataPoint(
                            showStatisticalPoints && dataPoints.showMedian,
                            legend.medianText,
                            measureId
                        ),
                        // Mean
                        ...getLegendDataPoint(
                            showStatisticalPoints && dataPoints.showMean && dataPoints.plotType !== 'barcodePlot',
                            legend.meanText,
                            measureId
                        )
                    ]) ||
                []
        };
        this.debug.log('Legend data instantiated.');
    }

    private getTitleText(legend: LegendSettings, measureOnly: boolean): string {
        return legend.showTitle
            ? legend.titleText
                ? legend.titleText
                : measureOnly
                ? null
                : this.viewModel.dataViewMetadata.categoryDisplayName
            : null;
    }

    /**
     *  Manage position based on our settings
     */
    private positionLegend() {
        this.position =
            this.settings.legend.show && !this.errorState
                ? LegendPosition[this.settings.legend.position]
                : LegendPosition.None;
        this.debug.log(`Position: ${LegendPosition[this.position]}`);
    }

    /**
     *  If the legend exceeds our limits for responsiveness, we will need to hide and re-draw. We also make the necessary adjustments
     *  to the viewport to cater for the legend. We will need to update the view model from the calling visual update so that it
     *  will render correctly.
     */
    private fixViewportForLegend() {
        this.debug.log('Checking legend position...');

        // If this exceeds our limits, then we will hide and re-draw prior to render
        let legendBreaksViewport = false;
        switch (this.legend.getOrientation()) {
            case LegendPosition.Left:
            case LegendPosition.LeftCenter:
            case LegendPosition.Right:
            case LegendPosition.RightCenter:
                legendBreaksViewport =
                    this.newViewport.width - this.legend.getMargins().width < this.settings.legend.widthLimit ||
                    this.newViewport.height < this.settings.legend.heightLimit;
                break;
            case LegendPosition.Top:
            case LegendPosition.TopCenter:
            case LegendPosition.Bottom:
            case LegendPosition.BottomCenter:
                legendBreaksViewport =
                    this.newViewport.height - this.legend.getMargins().height < this.settings.legend.heightLimit ||
                    this.newViewport.width < this.settings.legend.widthLimit;
                break;
        }

        // Adjust viewport (and hide legend) as appropriate
        this.debug.log('Legend dimensions', this.legend.getMargins());
        if (legendBreaksViewport) {
            this.debug.log('Legend dimensions cause the viewport to become unusable. Skipping over render...');
            this.legend.changeOrientation(LegendPosition.None);
            this.legend.drawLegend(this.data, this.newViewport);
        } else {
            this.debug.log('Legend dimensions are good to go!');
            this.newViewport.width -= this.legend.getMargins().width;
            this.newViewport.height -= this.legend.getMargins().height;
        }
        positionChartArea(this.container, this.legend);
        this.debug.log('Legend fully positioned.');
    }

    /**
     *  For us to tell if the legend is going to work, we need to draw it first in order to get its dimensions
     */
    private drawLegend() {
        this.legend.changeOrientation(this.position);
        this.debug.log('Legend orientation set.');
        this.legend.drawLegend(this.data, this.newViewport);
        this.debug.log('Legend drawn.');
    }

    /**
     *  Apply specific formatting to the legend data points for the violin annotations, as the legend utils are a bit limited.
     */
    private fixLegendIcons() {
        this.debug.log('Fixing up legend icons for new shapes...');
        let vl = this;

        d3.selectAll(`.${customIconClass}`).remove();
        d3.selectAll('.legendItem').each(function(d: LegendDataPoint, i) {
            // Element and positioning
            let node = d3.select(this),
                icon = node.select('.legendIcon');

            vl.debug.log('Legend point data', d);
            switch (d.tooltip) {
                case vl.settings.legend.spacerText:
                    vl.debug.log('Spacer: blank out');
                    icon.attr('opacity', 0);
                    vl.debug.log('Done!');
                    break;

                case vl.viewModel.legend.medianText:
                case vl.viewModel.legend.quartileCombinedText:
                case vl.viewModel.legend.quartile1Text:
                case vl.viewModel.legend.quartile3Text:
                    vl.debug.log('Line: doing further checks...');

                    const { strokeLineStyle, stroke, className } = getDynamicAttributes(
                        d,
                        vl.viewModel.legend,
                        vl.settings.dataPoints
                    );

                    icon.call(setHidden);
                    node.append('rect').call(setBoxAttributes, vl.viewModel.legend, itemRadius);
                    node.append('line')
                        .call(setLineAttributes, stroke, className)
                        .classed(strokeLineStyle, true);
                    break;

                case vl.viewModel.legend.meanText:
                    vl.debug.log('Mean info: re-style');
                    icon.call(setHidden);
                    node.append('rect').call(setBoxAttributes, vl.viewModel.legend, itemRadius);
                    node.append('circle')
                        .style({
                            fill: vl.settings.dataPoints.meanFillColourInner,
                            stroke: vl.settings.dataPoints.meanFillColour,
                            'stroke-width': 2
                        })
                        .call(setCircleAttributes);
                    break;

                case vl.viewModel.legend.dataPointText:
                    vl.debug.log('Data Point info: re-style');
                    icon.call(setHidden);
                    node.append('rect').call(setBoxAttributes, vl.viewModel.legend, itemRadius);
                    node.append('line').call(setLineAttributes, vl.settings.dataPoints.barColour, 'datapoint');
                    break;

                default:
                    vl.debug.log('Violin series: re-style');
                    icon.call(setHidden);
                    node.append('path').call(setViolinAttributes, icon.style('fill'));
                    break;
            }
        });
    }
}

interface ICustomLegendDynamicAttributes {
    className: string;
    stroke: string;
    strokeLineStyle: string;
}

const getDynamicAttributes = (
    d: LegendDataPoint,
    legend: IVMLegend,
    dataPoints: DataPointSettings
): ICustomLegendDynamicAttributes => {
    switch (d.tooltip) {
        case legend.medianText:
            return {
                className: 'median',
                strokeLineStyle: dataPoints[`medianStrokeLineStyle`],
                stroke: dataPoints.medianFillColour
            };
        case legend.quartileCombinedText:
            return {
                className: 'quartilesCombined',
                strokeLineStyle: dataPoints[`quartile1StrokeLineStyle`],
                stroke: dataPoints.quartile1FillColour
            };
        case legend.quartile1Text:
            return {
                className: 'quartile1',
                strokeLineStyle: dataPoints[`quartile1StrokeLineStyle`],
                stroke: dataPoints.quartile1FillColour
            };
        case legend.quartile3Text:
            return {
                className: 'quartile3',
                strokeLineStyle: dataPoints[`quartile3StrokeLineStyle`],
                stroke: dataPoints.quartile3FillColour
            };
        default:
            return {
                className: 'unknown',
                strokeLineStyle: 'solid',
                stroke: defaultFillColour
            };
    }
};

const getLegendDataPoint = (
    show: boolean,
    label: string,
    identity: ISelectionId = null,
    color: string = defaultFillColour
): LegendDataPoint[] =>
    (show && [
        {
            label: label,
            color,
            markerShape: MarkerShape.circle,
            selected: false,
            identity
        }
    ]) ||
    [];

const setHidden = (selection: d3.Selection<LegendDataPoint>) => {
    selection.attr('visibility', 'hidden');
};

const setBoxAttributes = (selection: d3.Selection<LegendDataPoint>, legend: IVMLegend) => {
    selection
        .classed(customIconClass, true)
        .attr('x', d => d.glyphPosition.x - itemRadius)
        .attr('y', d => d.glyphPosition.y - itemRadius)
        .attr('width', itemRadius * 2)
        .attr('height', itemRadius * 2)
        .attr('stroke', legend.boxColour)
        .attr('stroke-width', 1)
        .attr('fill', legend.boxColour)
        .attr('fill-opacity', legend.boxOpacity);
};

const setCircleAttributes = (selection: d3.Selection<LegendDataPoint>) => {
    selection
        .classed(customIconClass, true)
        .attr('cx', d => d.glyphPosition.x)
        .attr('cy', d => d.glyphPosition.y)
        .attr('r', itemRadius - boxStrokeWidth * 2);
};

const setLineAttributes = (selection: d3.Selection<LegendDataPoint>, stroke: string, className: string) => {
    selection
        .classed(customIconClass, true)
        .classed(className, true)
        .attr('x1', d => d.glyphPosition.x - itemRadius + boxStrokeWidth)
        .attr('x2', d => d.glyphPosition.x + itemRadius - boxStrokeWidth)
        .attr('y1', d => d.glyphPosition.y)
        .attr('y2', d => d.glyphPosition.y)
        .attr('stroke', stroke)
        .attr('stroke-width', lineStrokeWidth);
};

const setViolinAttributes = (selection: d3.Selection<LegendDataPoint>, fill: string) => {
    selection
        .classed(customIconClass, true)
        .attr('d', getViolinSvgPath(itemRadius))
        .attr('transform', d => `translate(${d.glyphPosition.x - itemRadius}, ${d.glyphPosition.y - itemRadius})`)
        .attr('fill', fill)
        .attr('transform-origin', 'top center')
        .attr('width', 10)
        .attr('height', 10);
};

/**
 * Generates SVG path definition for the legeng violin shape
 */
const getViolinSvgPath = (radius: number) =>
    `M${radius},-${radius} C${radius},${radius} -${radius},${radius} ${radius},${radius * 2} C${radius *
        3},${radius} ${radius},${radius} ${radius},-${radius}`;
