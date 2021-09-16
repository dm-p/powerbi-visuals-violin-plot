import powerbi from 'powerbi-visuals-api';
import IViewport = powerbi.IViewport;

import { IViewModel } from './models';
import { VisualSettings } from './settings';
import { VisualDebugger } from './visualDebugger';

const watermarkFontSize = 12;

/**
 *  Size our initial container to match the viewport
 *  We could potentially compare this on resize and do the appropriate calculations to minimise rework
 */
export const sizeMainContainer = (
    container: d3.Selection<{}>,
    viewport: IViewport
) => container.attr('width', viewport.width).attr('height', viewport.height);

export const plotCanvas = (container: d3.Selection<{}>, viewport: IViewport) =>
    container
        .append('svg')
        .classed('violinPlotCanvas', true)
        .attr('width', viewport.width)
        .attr('height', viewport.height);

export const plotSeriesContainer = (
    canvas: d3.Selection<{}>,
    viewModel: IViewModel
) =>
    canvas
        .selectAll('.violinPlotCanvas')
        .data(viewModel.categories)
        .enter()
        .append('g')
        .classed('violinPlotSeries', true)
        .attr(
            'transform',
            d =>
                `translate(${viewModel.xAxis.scale(d.name) +
                    viewModel.yAxis.dimensions.width}, 0)`
        )
        .attr('width', viewModel.xAxis.scale.rangeBand());

export const plotCategoryWarning = (
    canvas: d3.Selection<{}>,
    viewModel: IViewModel,
    viewport: IViewport
) =>
    viewModel.categoriesReduced &&
    canvas
        .append('g')
        .classed('condensedWarning', true)
        .attr('transform', `translate(${viewport.width - 20}, ${20})`)
        .attr('opacity', 0.6)
        .append('text')
        .html('&#9888;')
        .style('display', 'none');

export const plotWatermark = (
    canvas: d3.Selection<{}>,
    viewport: IViewport,
    settings: VisualSettings
) =>
    settings.about.development ||
    (settings.about.version.indexOf('DEV') !== -1 &&
        canvas
            .append('text')
            .attr(
                'transform',
                `translate(${viewport.width / 2}, ${watermarkFontSize * 2})`
            )
            .attr('text-anchor', 'middle')
            .attr('opacity', 0.5)
            .style('font-weight', 'bold')
            .style('fill', 'red')
            .style('font-size', `${watermarkFontSize}px`)
            .append('tspan')
            .text(
                `${settings.about.visualName.toUpperCase()} ${
                    settings.about.version
                } - NOT FOR PRODUCTION USE`
            )
            .attr('x', 0)
            .attr('dy', '-1em'));

export const plotXAxis = (
    canvas: d3.Selection<{}>,
    viewModel: IViewModel,
    settings: VisualSettings,
    viewport: IViewport,
    debug: VisualDebugger
) => {
    if (settings.xAxis.show) {
        debug.log('Plotting x-axis...');
        const xAxisContainer = plotXAxisContainer(canvas, viewModel, settings);

        debug.log('Plotting x-axis ticks...');
        const xAxisTicks = plotXAxisTicks(xAxisContainer, viewModel, viewport);

        // Apply gridline styling
        debug.log('Applying x-axis gridline styling...');
        plotXAxisGrid(xAxisTicks, settings);

        // Add title if required
        debug.log('Plotting x-axis title...');
        plotXAxisTitle(xAxisContainer, viewModel, settings);
    }
};

export const plotYAxis = (
    canvas: d3.Selection<{}>,
    viewModel: IViewModel,
    settings: VisualSettings,
    debug: VisualDebugger
) => {
    if (settings.yAxis.show) {
        debug.log('Plotting y-axis...');
        const yAxisContainer = plotYAxisContainer(canvas, viewModel, settings);

        debug.log('Plotting y-axis title...');
        plotYAxisTitle(yAxisContainer, viewModel, settings);

        debug.log('Plotting y-axis ticks...');
        const yAxisTicks = plotYAxisTicks(yAxisContainer, viewModel);

        // Apply gridline styling
        debug.log('Applying y-axis gridline styling...');
        plotYAxisGrid(yAxisTicks, settings);
    }
};

const plotXAxisContainer = (
    canvas: d3.Selection<{}>,
    viewModel: IViewModel,
    settings: VisualSettings
) =>
    canvas
        .append('g')
        .classed('xAxisContainer', true)
        .style('font-size', viewModel.xAxis.labelTextProperties.fontSize)
        .style('font-family', settings.xAxis.fontFamily)
        .style('fill', settings.xAxis.fontColor);

const plotYAxisContainer = (
    canvas: d3.Selection<{}>,
    viewModel: IViewModel,
    settings: VisualSettings
) =>
    canvas
        .append('g')
        .classed('yAxisContainer', true)
        .style('font-size', viewModel.yAxis.labelTextProperties.fontSize)
        .style('font-family', settings.yAxis.fontFamily)
        .style('fill', settings.yAxis.fontColor);

const plotXAxisTitle = (
    container: d3.Selection<{}>,
    viewModel: IViewModel,
    settings: VisualSettings
) =>
    settings.xAxis.showTitle &&
    viewModel.xAxis.titleDisplayName &&
    viewModel.xAxis.titleDimensions.height > 0 &&
    container
        .append('text')
        .classed('xAxisTitle', true)
        .attr('x', viewModel.xAxis.titleDimensions.x)
        .attr('y', viewModel.xAxis.titleDimensions.y)
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .style(
            'font-size',
            viewModel.xAxis.titleDisplayName.textProperties.fontSize
        )
        .style('font-family', settings.xAxis.titleFontFamily)
        .style('fill', settings.xAxis.titleColor)
        .text(viewModel.xAxis.titleDisplayName.tailoredName);

const plotYAxisTitle = (
    container: d3.Selection<{}>,
    viewModel: IViewModel,
    settings: VisualSettings
) =>
    settings.yAxis.showTitle &&
    viewModel.yAxis.titleDisplayName &&
    viewModel.yAxis.titleDimensions.width > 0 &&
    container
        .append('text')
        .classed('yAxisTitle', true)
        .attr('transform', 'rotate(-90)')
        .attr('x', viewModel.yAxis.titleDimensions.x)
        .attr('y', viewModel.yAxis.titleDimensions.y)
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .style(
            'font-size',
            viewModel.yAxis.titleDisplayName.textProperties.fontSize
        )
        .style('font-family', settings.yAxis.titleFontFamily)
        .style('fill', settings.yAxis.titleColor)
        .text(viewModel.yAxis.titleDisplayName.tailoredName);

const plotXAxisTicks = (
    container: d3.Selection<{}>,
    viewModel: IViewModel,
    viewport: IViewport
) =>
    container
        .append('g')
        .classed('xAxis', true)
        .classed('grid', true)
        .attr(
            'transform',
            `translate(${viewModel.yAxis.dimensions.width}, ${viewport.height -
                viewModel.xAxis.dimensions.height})`
        )
        .call(viewModel.xAxis.generator);

const plotYAxisTicks = (container: d3.Selection<{}>, viewModel: IViewModel) =>
    container
        .append('g')
        .classed('yAxis', true)
        .classed('grid', true)
        .attr('transform', `translate(${viewModel.yAxis.dimensions.width}, 0)`)
        .call(viewModel.yAxis.generator);

const plotXAxisGrid = (container: d3.Selection<{}>, settings: VisualSettings) =>
    container
        .selectAll('line')
        .attr('stroke', settings.xAxis.gridlineColor)
        .attr(
            'stroke-width',
            (settings.xAxis.gridlines && settings.xAxis.gridlineStrokeWidth) ||
                0
        )
        .classed(settings.xAxis.gridlineStrokeLineStyle, true);

const plotYAxisGrid = (container: d3.Selection<{}>, settings: VisualSettings) =>
    container
        .selectAll('line')
        .attr('stroke', settings.yAxis.gridlineColor)
        .attr(
            'stroke-width',
            (settings.yAxis.gridlines && settings.yAxis.gridlineStrokeWidth) ||
                0
        )
        .classed(settings.yAxis.gridlineStrokeLineStyle, true);

export const applyDataPointHighlight = (
    container: d3.Selection<{}>,
    viewModel: IViewModel,
    settings: VisualSettings
) =>
    container
        .append('line')
        .classed('comboPlotToolipDataPoint', true)
        .attr('stroke-width', 5)
        .attr('stroke-opacity', 1)
        .attr('stroke', settings.dataPoints.barColour)
        .attr('x1', viewModel.barcodePlot.featureXLeft)
        .attr('x2', viewModel.barcodePlot.featureXRight)
        .attr('y1', 0)
        .attr('y2', 0)
        .style('display', 'none');
