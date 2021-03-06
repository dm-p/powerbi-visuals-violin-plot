import powerbi from 'powerbi-visuals-api';
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewObject = powerbi.DataViewObject;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import { valueFormatter } from 'powerbi-visuals-utils-formattingutils';

import * as d3 from 'd3';

import {
    IViewModel,
    ICategory,
    IVisualDataPoint,
    IDataPointAggregate,
    IAxisLinear,
    EViolinSide,
    EBoxPlotWhisker,
    TComboPlotType,
    EFeatureLineType
} from './models';
import { VisualSettings } from './settings';
import { applyDataPointHighlight } from './dom';
import { getFormattedRowCount } from './utils';

/**
 * Gets property value for a particular object in a category.
 *
 * @function
 * @param {DataViewCategoryColumn} category             - List of category objects.
 * @param {number} index                                - Index of category object.
 * @param {string} objectName                           - Name of desired object.
 * @param {string} propertyName                         - Name of desired property.
 * @param {T} defaultValue                              - Default value of desired property.
 */
export function getCategoricalObjectValue<T>(
    category: DataViewCategoryColumn,
    index: number,
    objectName: string,
    propertyName: string,
    defaultValue: T
): T {
    let categoryObjects = category.objects;

    if (categoryObjects) {
        let categoryObject: DataViewObject = categoryObjects[index];
        if (categoryObject) {
            let object = categoryObject[objectName];
            if (object) {
                let property: T = <T>object[propertyName];
                if (property !== undefined) {
                    return property;
                }
            }
        }
    }
    return defaultValue;
}

/**
 * Render SVG line and area for a given violin series
 *
 * @param seriesContainer                               - The element to apply the SVG rendering to
 * @param viewModel                                     - The view model object to use
 * @param settings                                      - Visual settings
 * @param side                                          - The side to render the plot on (we need two plots per series for a violin)
 */
function renderViolinLine(
    seriesContainer: d3.Selection<ICategory>,
    viewModel: IViewModel,
    settings: VisualSettings,
    side: EViolinSide
) {
    // Add the violin side container
    let violinContainer = seriesContainer
        .append('g')
        .classed({
            violinPlotViolin: true
        })
        .datum(d => d)
        .classed(`${EViolinSide[side]}`, true)
        .attr({
            transform: `rotate(90, 0, 0) translate(0, -${viewModel.xAxis.scale.rangeBand() / 2}) ${
                side === EViolinSide.right ? 'scale(1, -1)' : ''
            }`,
            'shape-rendering': 'geometricPrecision'
        });

    // Area - no point bothering if we're fully transparent
    if (settings.dataColours.transparency !== 100) {
        violinContainer
            .append('path')
            .classed('violinPlotViolinPlot', true)
            .classed('area', true)
            .attr('d', d => d.areaGen(d.dataKde))
            .style({
                fill: d => d.colour,
                'fill-opacity': 1 - settings.dataColours.transparency / 100,
                'stroke-width': 0
            });
    }

    // Line
    violinContainer
        .append('path')
        .classed('violinPlotViolinPlot', true)
        .classed('line', true)
        .attr('d', d => d.lineGen(d.dataKde))
        .style({
            fill: 'none',
            stroke: d => d.colour,
            'stroke-width': `${settings.violin.strokeWidth}px`,
            'stroke-linecap': !settings.violin.clamp ? 'round' : 'butt'
        });
}

/**
 * Handle rendering of the violin based on the selected type
 *
 * @param seriesContainer                               - The element to apply the SVG rendering to
 * @param viewModel                                     - The view model object to use
 * @param settings                                      - Visual settings
 */
export function renderViolin(
    seriesContainer: d3.Selection<ICategory>,
    viewModel: IViewModel,
    settings: VisualSettings
) {
    if (settings.violin.type === 'line') {
        renderViolinLine(seriesContainer, viewModel, settings, EViolinSide.left);
        renderViolinLine(seriesContainer, viewModel, settings, EViolinSide.right);
    }
}

/**
 * Handle rendering of a box plot whisker. Will render for the specified range.
 * For top, this will run from `quartile 3` to `95%`;
 * For bottom, this will run from `5%` to `quartile 1`
 *
 * @param seriesContainer                               - The element to apply the SVG rendering to
 * @param viewModel                                     - The view model object to use
 * @param settings                                      - Visual settings
 * @param whisker                                       - The whisker to render
 */
function renderBoxPlotWhisker(
    boxPlotContainer: d3.Selection<ICategory>,
    viewModel: IViewModel,
    settings: VisualSettings,
    whisker: EBoxPlotWhisker
) {
    boxPlotContainer
        .append('line')
        .classed({
            violinPlotBoxPlot: true,
            whisker: true
        })
        .classed('range', true)
        .attr({
            x1: viewModel.xAxis.scale.rangeBand() / 2,
            x2: viewModel.xAxis.scale.rangeBand() / 2,
            y1: d =>
                viewModel.yAxis.scale(
                    whisker === EBoxPlotWhisker.bottom ? d.statistics.confidenceLower : d.statistics.confidenceUpper
                ),
            y2: d =>
                viewModel.yAxis.scale(
                    whisker === EBoxPlotWhisker.bottom ? d.statistics.quartile1 : d.statistics.quartile3
                ),
            'stroke-width': `${settings.dataPoints.strokeWidth}px`,
            stroke: `${settings.dataPoints.boxFillColour}`
        });
}

/**
 * Handles rendering of a mean within the appropariate combo plot.
 *
 * @param container                                     - Container to apply the mean circle to
 * @param viewModel                                     - View model to use when calculating
 * @param settings                                      - Visual settings
 */
function renderComboPlotMean(container: d3.Selection<ICategory>, viewModel: IViewModel, settings: VisualSettings) {
    if (settings.dataPoints.showMean && viewModel.boxPlot.width > viewModel.boxPlot.actualMeanDiameter) {
        container
            .append('circle')
            .classed({
                violinPlotBoxPlot: true,
                mean: true,
                outer: true
            })
            .attr({
                cx: viewModel.xAxis.scale.rangeBand() / 2,
                cy: d => viewModel.yAxis.scale(d.statistics.mean),
                // Don't render if larger than the box height
                r: d =>
                    -(viewModel.yAxis.scale(d.statistics.quartile3) - viewModel.yAxis.scale(d.statistics.quartile1)) <
                    viewModel.boxPlot.actualMeanDiameter
                        ? 0
                        : viewModel.boxPlot.actualMeanRadius
            })
            .style({
                fill: settings.dataPoints.meanFillColourInner,
                stroke: settings.dataPoints.meanFillColour,
                'stroke-width': `${settings.dataPoints.meanStrokeWidth}px`
            });
    }
}

/**
 * Handles the rendering of a box/column plot rectangle for the combo plot
 *
 * @param container                                     - Container to apply the rectangle to
 * @param viewModel                                     - View model to use when calculating
 * @param settings                                      - Visual settings
 */
function renderComboPlotRectangle(container: d3.Selection<ICategory>, viewModel: IViewModel, settings: VisualSettings) {
    container
        .append('rect')
        .classed({
            violinPlotBoxPlot: true,
            box: true
        })
        .attr({
            x: viewModel.boxPlot.xLeft,
            y: d => {
                switch (settings.dataPoints.plotType) {
                    case 'boxPlot':
                        return viewModel.yAxis.scale(d.statistics.quartile3);
                    case 'columnPlot':
                        return viewModel.yAxis.scale(d.statistics.max);
                }
            },
            width: viewModel.boxPlot.width,
            height: d => {
                switch (settings.dataPoints.plotType) {
                    case 'boxPlot':
                        return (
                            -viewModel.yAxis.scale(d.statistics.quartile3) +
                            viewModel.yAxis.scale(d.statistics.quartile1)
                        );
                    case 'columnPlot':
                        return -viewModel.yAxis.scale(d.statistics.max) + viewModel.yAxis.scale(d.statistics.min);
                }
            },
            stroke: `${settings.dataPoints.boxFillColour}`,
            'stroke-width': `${settings.dataPoints.strokeWidth}px`,
            fill: `${settings.dataPoints.boxFillColour}`,
            'fill-opacity': 1 - settings.dataPoints.transparency / 100
        });
}

const barCodePlotCanRender = (plotWidth: number, strokeWidth: number, comboPlotType: TComboPlotType) =>
    comboPlotType === 'barcodePlot' && plotWidth > strokeWidth;

/**
 * Handle rendering of barcode plot, which will plot a fixed-width horizontal line for each data point in the category
 *
 * @param seriesContainer                               - Container to apply the box plot to
 * @param viewModel                                     - View model to use when calculating
 * @param settings                                      - Visual settings
 */
export function renderLinePlot(
    seriesContainer: d3.Selection<ICategory>,
    viewModel: IViewModel,
    settings: VisualSettings,
    comboPlotType: TComboPlotType
) {
    if (barCodePlotCanRender(viewModel.barcodePlot.width, settings.dataPoints.strokeWidth, comboPlotType)) {
        const xLeft = viewModel.barcodePlot.xLeft,
            xRight = viewModel.barcodePlot.xRight;
        // Add the container
        let comboPlotContainer = seriesContainer
            .append('g')
            .classed('violinPlotComboLinePlotContainer', true)
            .attr('shape-rendering', 'geometricPrecision');

        // Add overlay for interactivity - the shape of this is going to depend on the plot
        let overlay = seriesContainer
            .append('rect')
            .classed('violinPlotComboPlotOverlay', true)
            .attr('width', viewModel[comboPlotType].width)
            /** We adjust by the stroke width to ensure that the overlay covers all rendering of the data points (if we
             *  hover over an element that isn't bound to an ICategory then we can't display the tooltip properly)
             */
            .attr(
                'height',
                d =>
                    -(
                        viewModel.yAxis.scale(d.statistics.interpolateMax) -
                        viewModel.yAxis.scale(d.statistics.interpolateMin)
                    ) +
                    settings.dataPoints.strokeWidth * 2
            )
            .attr('x', xLeft)
            .attr('y', d => viewModel.yAxis.scale(d.statistics.interpolateMax) - settings.dataPoints.strokeWidth);

        // Line used to represent highlighted data point. Will be moved/hidden on mouse events
        comboPlotType === 'barcodePlot' && applyDataPointHighlight(comboPlotContainer, viewModel, settings);

        // Plot data points
        comboPlotContainer
            .selectAll('.tooltipDataPoint')
            .data(
                (d, i) => <IVisualDataPoint[]>d.dataPointsAgg.map(dp => ({
                        value: dp.key,
                        count: dp.count,
                        categoryIndex: i
                    }))
            )
            .enter()
            .append('line')
            .classed('tooltipDataPoint', true)
            .attr('x1', comboPlotType === 'barcodePlot' && xLeft)
            .attr('x2', comboPlotType === 'barcodePlot' && xRight)
            .attr('y1', d => viewModel.yAxis.scale(d.value))
            .attr('y2', d => viewModel.yAxis.scale(d.value))
            .attr('stroke', `${settings.dataPoints.barColour}`)
            .attr('stroke-width', `${settings.dataPoints.strokeWidth}px`)
            .attr('stroke-linecap', 'butt');

        // Add quartile, mean and median features as appropriate
        if (settings.dataPoints.showMedian) {
            renderFeatureLine(comboPlotContainer, viewModel, settings, EFeatureLineType.median, comboPlotType);
        }
        if (settings.dataPoints.showQuartiles) {
            renderFeatureLine(comboPlotContainer, viewModel, settings, EFeatureLineType.quartile1, comboPlotType);
            renderFeatureLine(comboPlotContainer, viewModel, settings, EFeatureLineType.quartile3, comboPlotType);
        }
    }
}

/**
 * Handle rendering of ranged column combo plot
 *
 * @param seriesContainer                               - Container to apply the column plot to
 * @param viewModel                                     - View model to use when calculating
 * @param settings                                      - Visual settings
 */
export function renderColumnPlot(
    seriesContainer: d3.Selection<ICategory>,
    viewModel: IViewModel,
    settings: VisualSettings
) {
    if (viewModel.columnPlot.width > settings.dataPoints.strokeWidth) {
        // Add the box
        let boxContainer = seriesContainer.append('g').attr({
            'shape-rendering': 'geometricPrecision'
        });
        renderComboPlotRectangle(boxContainer, viewModel, settings);

        // Mean, median & quartiles
        if (settings.dataPoints.showMedian) {
            renderFeatureLine(boxContainer, viewModel, settings, EFeatureLineType.median, 'boxPlot');
        }
        if (settings.dataPoints.showQuartiles) {
            renderFeatureLine(boxContainer, viewModel, settings, EFeatureLineType.quartile1, 'boxPlot');
            renderFeatureLine(boxContainer, viewModel, settings, EFeatureLineType.quartile3, 'boxPlot');
        }
        if (settings.dataPoints.showMean && viewModel.columnPlot.width > viewModel.columnPlot.actualMeanDiameter) {
            renderComboPlotMean(boxContainer, viewModel, settings);
        }
    }
}

/**
 * Handle rendering of box plot
 *
 * @param seriesContainer                               - Container to apply the box plot to
 * @param viewModel                                     - View model to use when calculating
 * @param settings                                      - Visual settings
 */
export function renderBoxPlot(
    seriesContainer: d3.Selection<ICategory>,
    viewModel: IViewModel,
    settings: VisualSettings
) {
    if (viewModel.boxPlot.width > settings.dataPoints.strokeWidth) {
        // Add the box
        let boxContainer = seriesContainer.append('g').attr({
            'shape-rendering': 'geometricPrecision'
        });
        renderComboPlotRectangle(boxContainer, viewModel, settings);

        // Do the whiskers, if we need them
        if (settings.dataPoints.showWhiskers) {
            renderBoxPlotWhisker(boxContainer, viewModel, settings, EBoxPlotWhisker.bottom);
            renderBoxPlotWhisker(boxContainer, viewModel, settings, EBoxPlotWhisker.top);
        }

        // Mean and median
        if (settings.dataPoints.showMedian) {
            renderFeatureLine(boxContainer, viewModel, settings, EFeatureLineType.median, 'boxPlot');
        }
        if (settings.dataPoints.showMean && viewModel.boxPlot.width > viewModel.boxPlot.actualMeanDiameter) {
            renderComboPlotMean(boxContainer, viewModel, settings);
        }
    }
}

/**
 * Render a 'feature' line, i.e. a non-standard data point. Currently supports median and 1st/3rd quartiles based on the `EFeatureLineType` enum
 *
 * @param containingElement                             - The element to attach the message to
 * @param viewModel                                     - View model containing data and other required properties
 * @param settings                                      - Visual settings
 * @param lineType                                      - The line type to render
 * @param comboPlotType                                 - Combination plot type to render line against (used to retrieve specific settings and view model properties)
 */
export function renderFeatureLine(
    containingElement: d3.Selection<ICategory>,
    viewModel: IViewModel,
    settings: VisualSettings,
    lineType: EFeatureLineType,
    comboPlotType: TComboPlotType
) {
    let featureXLeft: number = viewModel[comboPlotType].featureXLeft,
        featureXRight: number = viewModel[comboPlotType].featureXRight;

    containingElement
        .append('line')
        .classed('violinPlotComboPlotFeatureLine', true)
        .classed(`${EFeatureLineType[lineType]}`, true)
        .classed(`${settings.dataPoints[`${EFeatureLineType[lineType]}StrokeLineStyle`]}`, true)
        .attr({
            x1: featureXLeft,
            x2: featureXRight,
            y1: d => viewModel.yAxis.scale(d.statistics[`${EFeatureLineType[lineType]}`]),
            y2: d => viewModel.yAxis.scale(d.statistics[`${EFeatureLineType[lineType]}`]),
            stroke: `${settings.dataPoints[`${EFeatureLineType[lineType]}FillColour`]}`,
            'stroke-width': `${settings.dataPoints[`${EFeatureLineType[lineType]}StrokeWidth`]}px`
        });
}

/**
 * Display usage information within the viewport
 *
 * @param containingElement                             - The element to attach the message to
 * @param host                                          - The visual host
 * @param settings                                      - Current visual instance settings
 */
export function visualUsage(containingElement: d3.Selection<{}>, host: IVisualHost, settings: VisualSettings) {
    let container = containingElement
        .append('div')
        .classed('card', true)
        .classed('border-0', true)
        .append('div')
        .classed('card-body', true);
    container
        .append('h5')
        .classed('card-title', true)
        .html('Usage');
    container
        .append('p')
        .classed('card-text', true)
        .html(
            'Please ensure that you have added data to the <strong>Sampling</strong>\
                            and <strong>Measure Data</strong> fields &#128522;'
        );
    container
        .append('p')
        .classed('card-text', true)
        .html(
            'You can also supply an optional <strong>Category</strong> to plot multiple \
                            violins within your data set.'
        );
    let usageLink = container
        .append('a')
        .attr('href', '#')
        .attr('role', 'button')
        .classed('btn', true)
        .classed('btn-outline-info', true)
        .classed('btn-sm', true)
        .html('Detailed Help (External Site)');
    usageLink.on('click', () => {
        host.launchUrl(settings.about.usageUrl);
    });
}

/**
 * Display additional information to the end-user when loading more data from the data model.
 *
 * @param rowCount                                      - Total number of rows currently loaded
 * @param containingElement                             - The element to attach the message to
 * @param settings                                      - Current visual instance settings
 */
export function dataLimitLoadingStatus(
    rowCount: number,
    containingElement: d3.Selection<{}>,
    settings: VisualSettings,
    locale: string
) {
    let container = containingElement.append('div').classed('loading-notes', true),
        progressIndicator = container.append('div');
    progressIndicator
        .append('span')
        .classed('spinner-grow', true)
        .classed('spinner-grow-sm', true)
        .classed('float-right', true);
    progressIndicator
        .append('span')
        .html(`Loading data: <strong>${getFormattedRowCount(rowCount, locale)}</strong> rows loaded so far...`)
        .classed('align-middle', true);

    if (settings.dataLimit.showCustomVisualNotes) {
        container.append('hr');
        container.append('p').html(
            `Visuals have a conventional limit of 30K rows. By overriding this limit, we can request more data \
                    in batches until until Power BI's memory allocation limit for the visual is reached. This can be \
                    costly and will run for every update to your visual (including property changes).<br/><br/>\
                    If you are making changes to your visual's appearance then it is recommended that you turn off <strong>\
                    Additional Data Fetching</strong> in in the <strong>Data Fetching Options</strong> pane while doing so, and \
                    re-enable when finished.`
        );
    }
}

/**
 * Display 'collapsed' state of the visual
 *
 * @param containingElement                              - The element to attach the message to
 */
export function visualCollapsed(containingElement: d3.Selection<{}>) {
    containingElement
        .append('div')
        .classed('container', true)
        .html('&nbsp;');
}

/**
 * Use the mouse position to determine the nearest data point on the y-axis
 *
 * @param overlay                                       - The overlay element to track
 * @param mouse                                         - Number array of corodinate data
 * @param yAxis                                         - Axis object to use for scaling
 */
export function getHighlightedDataPoints(
    overlay: d3.Selection<ICategory>,
    mouse: number[],
    yAxis: IAxisLinear
): IDataPointAggregate {
    let yData = yAxis.scale.invert(mouse[1]),
        bisectValue = d3.bisector((d: IDataPointAggregate) => Number(d.key)).left,
        ttv: IDataPointAggregate;

    overlay.each((d, i) => {
        let data = d.dataPointsAgg,
            idx = bisectValue(data, yData, 1),
            d0 = data[idx - 1],
            d1 = data[idx] ? data[idx] : d0;
        ttv = yData - Number(d0.key) > Number(d1.key) - yData ? d1 : d0;
    });
    return ttv;
}
