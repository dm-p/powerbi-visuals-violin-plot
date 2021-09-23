import powerbi from 'powerbi-visuals-api';
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ITooltipService = powerbi.extensibility.ITooltipService;
import { valueFormatter } from 'powerbi-visuals-utils-formattingutils';

import * as d3 from 'd3';

import { TooltipSettings, VisualSettings } from './settings';
import { VisualDebugger } from './visualDebugger';
import { IViewModel, ICategory, IDataPointAggregate } from './models';
import { getHighlightedDataPoints } from './visualHelpers';
import { isNumberTruthy } from './utils';

export { bindSeriesTooltipEvents, getTooltipData };

const isTouchEvent = true,
    bandwidthFormat = '#0.00',
    samplesFormat = '#,0',
    standardTooltipColor = '#000000',
    standardTooltipOpacity = '0';

const tooltipDebugger = (settings: VisualSettings) =>
    new VisualDebugger(settings.about.debugMode && settings.about.debugTooltipEvents);

const bindSeriesTooltipEvents = (
    elements: d3.Selection<ICategory>,
    tooltipService: ITooltipService,
    settings: VisualSettings,
    viewModel: IViewModel
) => {
    elements.on('mouseover', d => handleSeriesTooltip(tooltipService, settings, viewModel, d));
    elements.on('mousemove', d => handleSeriesTooltip(tooltipService, settings, viewModel, d));
    elements.on('mouseout', d => handleSeriesTooltip(tooltipService, settings, viewModel, d));
};

const getEvent = () => <MouseEvent>window.event;

const handleSeriesTooltip = (
    tooltipService: ITooltipService,
    settings: VisualSettings,
    viewModel: IViewModel,
    datum: ICategory
) => {
    const debug = tooltipDebugger(settings),
        event = getEvent(),
        coordinates = resolveCoordinates(event),
        target = <HTMLElement>(<Event>d3.event).target;

    let dataPoint: boolean, highlightedValue: IDataPointAggregate;

    debug.log('Instantiating tooltip...');
    debug.log('Datum', datum);
    debug.log('Selection ID', datum.selectionId);

    /** Depending on the element we have in context, we will possibly need to display a highlighted data value in the tooltip, and
     *  an assistive element to indicate which one is highlighted. We handle this here.
     */
    if (target?.classList.contains('violinPlotComboPlotOverlay')) {
        debug.log('Combo Plot Overlay Highlighted');
        dataPoint = true;
        highlightedValue = getHighlightedDataPoints(d3.select(target), d3.mouse(target), viewModel.yAxis);
        d3.select(target.parentNode)
            .selectAll('.comboPlotToolipDataPoint')
            .attr({
                y1: viewModel.yAxis.scale(Number(highlightedValue.key)),
                y2: viewModel.yAxis.scale(Number(highlightedValue.key))
            })
            .style('display', undefined);
        d3.selectAll('.tooltipDataPoint').attr('stroke-opacity', 0.25);
        debug.log(`Highlighted Value: ${highlightedValue.key}`);
    } else {
        debug.log('Category Highlighted');
    }

    switch (event.type) {
        case 'mouseover':
        case 'mousemove': {
            const dataItems = getTooltipData(settings, viewModel, datum, highlightedValue);
            tooltipService.show({
                coordinates,
                isTouchEvent,
                identities: (datum.selectionId && [datum.selectionId]) || [],
                dataItems
            });
            break;
        }
        default: {
            d3.selectAll('.tooltipDataPoint').attr('stroke-opacity', 1);
            d3.selectAll('.comboPlotToolipDataPoint').style('display', 'none');
            hideTooltip(tooltipService);
        }
    }
};

/**
 * For a highlighted data point, get its tooltip data and return it to the `tooltipServiceWrapper`.
 * Behaviour will depend on the tooltip settings, so this will handle the adding or omission of statistics accordingly.
 * @param value
 * @param settings
 * @param viewModel
 */
const getTooltipData = (
    settings: VisualSettings,
    viewModel: IViewModel,
    v: ICategory,
    highlightedValue?: IDataPointAggregate
): VisualTooltipDataItem[] => {
    const debug = tooltipDebugger(settings),
        format = viewModel.yAxis.labelFormatter.options.format,
        { tooltip: tts, dataPoints: cs } = settings,
        locale = viewModel.locale,
        stats = v.statistics,
        { categoryDisplayName } = viewModel.dataViewMetadata,
        { specifyBandwidth } = settings.violin,
        boxPlot = cs.plotType === 'boxPlot',
        barPlot = cs.plotType === 'barcodePlot',
        tooltips: VisualTooltipDataItem[] = [
            getTooltipCategory(v, categoryDisplayName),
            ...[
                formatTooltipSamplesValue(
                    '# Samples',
                    stats.count,
                    tts,
                    locale,
                    (barPlot && cs.barColour) || cs.boxFillColour
                )
            ],
            ...getTooltipValue(tts.showMaxMin, stats.max, 'Maximum', tts, locale, format),
            ...getTooltipValue(tts.showMaxMin, stats.min, 'Minimum', tts, locale, format),
            ...getTooltipValue(tts.showSpan, stats.span, 'Span (Min to Max)', tts, locale, format),
            ...getTooltipValue(
                tts.showMedian,
                stats.median,
                'Median',
                tts,
                locale,
                format,
                cs.showMedian && cs.medianFillColour
            ),
            ...getTooltipValue(tts.showMean, stats.mean, 'Mean', tts, locale, format, cs.showMean && cs.meanFillColour),
            ...getTooltipValue(tts.showDeviation, stats.deviation, 'Standard Deviation', tts, locale, format),
            ...getTooltipValue(
                tts.showQuartiles,
                stats.quartile3,
                'Upper Quartile',
                tts,
                locale,
                format,
                !boxPlot && cs.showQuartiles && cs.quartile1FillColour
            ),
            ...getTooltipValue(
                tts.showQuartiles,
                stats.quartile1,
                'Lower Quartile',
                tts,
                locale,
                format,
                !boxPlot && cs.showQuartiles && cs.quartile3FillColour
            ),
            ...getTooltipValue(tts.showIqr, stats.iqr, 'Inter Quartile Range', tts, locale, format),
            ...getTooltipValue(tts.showConfidence, stats.confidenceUpper, 'Upper Whisker (95%)', tts, locale, format),
            ...getTooltipValue(tts.showConfidence, stats.confidenceLower, 'Lower Whisker (5%)', tts, locale, format),
            ...([
                specifyBandwidth &&
                    tts.showBandwidth &&
                    formatTooltipBandwidthValue('Bandwidth (Specified)', stats.bandwidthActual, locale)
            ] || []),
            ...([
                tts.showBandwidth &&
                    formatTooltipBandwidthValue(
                        `Bandwidth (Estimated${specifyBandwidth ? ', N/A' : ''})`,
                        stats.bandwidthSilverman,
                        locale
                    )
            ] || []),
            ...getTooltipValue(
                highlightedValue && true,
                Number(highlightedValue?.key),
                `${viewModel.measure} - Highlighted`,
                tts,
                locale,
                format,
                cs.barColour
            ),
            ...([
                highlightedValue &&
                    true &&
                    formatTooltipSamplesValue(
                        '# Samples with Highlighted Value',
                        highlightedValue?.values?.count,
                        tts,
                        locale,
                        cs.barColour
                    )
            ] || [])
        ];
    debug.log('Tooltip Data', tooltips);
    return tooltips;
};

const getTooltipCategory = (v: ICategory, displayName: string) => ({
    displayName,
    value: v.displayName.formattedName ? v.displayName.formattedName : 'All Data',
    color: v.colour
});

const getTooltipValue = (
    show: boolean,
    value: number,
    label: string,
    tts: TooltipSettings,
    locale: string,
    format: string,
    color?: string
) =>
    (show && [
        formatTooltipValue(label, format, value, tts.measureDisplayUnits, tts.measurePrecision, locale, color)
    ]) ||
    [];

const hideTooltip = (tooltipService: ITooltipService) => {
    const immediately = true;
    tooltipService.hide({
        immediately,
        isTouchEvent
    });
};

const resolveCoordinates = (event: MouseEvent): [number, number] => [event.clientX, event.clientY];

/**
 *  Return a formatted `VisualTooltipDataItem` based on the supplied parameters
 *
 *  @param displayName      - Display name to apply to tooltip data point
 *  @param measureFormat    - The format string to apply to the value
 *  @param value            - The value to format
 *  @param displayUnits     - Display units to apply to the value
 *  @param precision        - Precision (decimal places) to apply to the value
 *  @param locale           - Regional settings to apply to the number format
 */
const formatTooltipValue = (
    displayName: string,
    measureFormat: string,
    value: number,
    displayUnits: number,
    precision: number,
    locale: string,
    color?: string
): VisualTooltipDataItem => {
    let formatter = valueFormatter.create({
        format: measureFormat,
        value: displayUnits === 0 ? value : displayUnits,
        precision: precision != null ? precision : null,
        cultureSelector: locale
    });
    const tt = {
        ...standardTooltipParams,
        ...{
            displayName: displayName,
            value: formatter.format(value)
        },
        ...((color && {
            color,
            opacity: '1'
        }) ||
            {})
    };
    console.log('Tooltip', tt);
    return tt;
};

const formatTooltipSamplesValue = (
    displayName: string,
    value: number,
    settings: TooltipSettings,
    locale: string,
    color: string
): VisualTooltipDataItem => {
    const formatter = valueFormatter.create({
        format: samplesFormat,
        value: (settings.numberSamplesDisplayUnits === 0 && value) || settings.numberSamplesDisplayUnits,
        precision: (isNumberTruthy(settings.numberSamplesPrecision) && settings.numberSamplesPrecision) || null,
        cultureSelector: locale
    });
    return {
        displayName,
        value: formatter.format(value),
        color
    };
};

const formatTooltipBandwidthValue = (displayName: string, value: number, locale: string): VisualTooltipDataItem => {
    const formatter = valueFormatter.create({
        format: bandwidthFormat,
        cultureSelector: locale
    });
    return {
        ...standardTooltipParams,
        ...{
            displayName,
            value: formatter.format(value)
        }
    };
};

const standardTooltipParams: Partial<VisualTooltipDataItem> = {
    color: standardTooltipColor,
    opacity: standardTooltipOpacity
};
