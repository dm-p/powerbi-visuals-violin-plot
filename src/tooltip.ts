import powerbi from 'powerbi-visuals-api';
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ITooltipService = powerbi.extensibility.ITooltipService;

import * as d3 from 'd3';

import { VisualSettings } from './settings';
import { VisualDebugger } from './visualDebugger';
import { IViewModel, ICategory, IDataPointAggregate } from './models';
import { getHighlightedDataPoints, formatTooltipValue } from './visualHelpers';

export { bindWarningTooltipEvents, bindSeriesTooltipEvents };

const isTouchEvent = true;

const tooltipDebugger = (settings: VisualSettings) =>
    new VisualDebugger(
        settings.about.debugMode && settings.about.debugTooltipEvents
    );

const bindWarningTooltipEvents = (
    element: d3.Selection<{}>,
    tooltipService: ITooltipService,
    settings: VisualSettings
) => {
    element.on('mouseover', () =>
        handleWarningTooltip(tooltipService, settings)
    );
    element.on('mousemove', () =>
        handleWarningTooltip(tooltipService, settings)
    );
    element.on('mouseout', () =>
        handleWarningTooltip(tooltipService, settings)
    );
};

const bindSeriesTooltipEvents = (
    elements: d3.Selection<ICategory>,
    tooltipService: ITooltipService,
    settings: VisualSettings,
    viewModel: IViewModel
) => {
    elements.on('mouseover', d =>
        handleSeriesTooltip(tooltipService, settings, viewModel, d)
    );
    elements.on('mousemove', d =>
        handleSeriesTooltip(tooltipService, settings, viewModel, d)
    );
    elements.on('mouseout', d =>
        handleSeriesTooltip(tooltipService, settings, viewModel, d)
    );
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
        highlightedValue = getHighlightedDataPoints(
            d3.select(target),
            d3.mouse(target),
            viewModel.yAxis
        );
        d3.select(target.parentNode)
            .select('.comboPlotToolipDataPoint')
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
            const dataItems = getTooltipData(
                settings,
                viewModel,
                datum,
                highlightedValue
            );
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
            d3.select('.comboPlotToolipDataPoint').style('display', 'none');
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
    let tooltips: VisualTooltipDataItem[] = [];
    const debug = tooltipDebugger(settings),
        measureFormat = viewModel.yAxis.labelFormatter.options.format,
        tts = settings.tooltip;

    tooltips.push(
        {
            displayName: 'Category',
            value: v.displayName.formattedName
                ? v.displayName.formattedName
                : 'All Data',
            color: v.colour
        },
        formatTooltipValue(
            '# Samples',
            measureFormat,
            v.statistics.count,
            tts.numberSamplesDisplayUnits,
            tts.numberSamplesPrecision,
            viewModel.locale
        )
    );
    debug.log('Pushed category and samples');

    tts.showMaxMin &&
        tooltips.push(
            formatTooltipValue(
                'Maximum',
                measureFormat,
                v.statistics.max,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            ),
            formatTooltipValue(
                'Minimum',
                measureFormat,
                v.statistics.min,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            )
        );

    tts.showSpan &&
        tooltips.push(
            formatTooltipValue(
                'Span (Min to Max)',
                measureFormat,
                v.statistics.span,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            )
        );

    tts.showMedian &&
        tooltips.push(
            formatTooltipValue(
                'Median',
                measureFormat,
                v.statistics.median,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            )
        );

    tts.showMean &&
        tooltips.push(
            formatTooltipValue(
                'Mean',
                measureFormat,
                v.statistics.mean,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            )
        );

    tts.showDeviation &&
        tooltips.push(
            formatTooltipValue(
                'Standard Deviation',
                measureFormat,
                v.statistics.deviation,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            )
        );

    tts.showQuartiles &&
        tooltips.push(
            formatTooltipValue(
                'Upper Quartile',
                measureFormat,
                v.statistics.quartile3,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            ),
            formatTooltipValue(
                'Lower Quartile',
                measureFormat,
                v.statistics.quartile1,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            )
        );

    tts.showIqr &&
        tooltips.push(
            formatTooltipValue(
                'Inter Quartile Range',
                measureFormat,
                v.statistics.iqr,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            )
        );

    tts.showConfidence &&
        tooltips.push(
            formatTooltipValue(
                'Upper whisker (95%)',
                measureFormat,
                v.statistics.confidenceUpper,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            ),
            formatTooltipValue(
                'Lower whisker (5%)',
                measureFormat,
                v.statistics.confidenceLower,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            )
        );

    tts.showBandwidth &&
        settings.violin.specifyBandwidth &&
        tooltips.push(
            formatTooltipValue(
                'Bandwidth (Specified)',
                measureFormat,
                v.statistics.bandwidthActual,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            )
        );
    tts.showBandwidth &&
        tooltips.push(
            formatTooltipValue(
                `Bandwidth (Estimated${
                    settings.violin.specifyBandwidth ? ', N/A' : ''
                })`,
                measureFormat,
                v.statistics.bandwidthSilverman,
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            )
        );

    highlightedValue &&
        tooltips.push(
            formatTooltipValue(
                `${viewModel.measure} - Highlighted`,
                measureFormat,
                Number(highlightedValue.key),
                tts.measureDisplayUnits,
                tts.measurePrecision,
                viewModel.locale
            ),
            formatTooltipValue(
                '# Samples with Highlighted Value',
                measureFormat,
                highlightedValue.values.count,
                tts.numberSamplesDisplayUnits,
                tts.numberSamplesPrecision,
                viewModel.locale
            )
        );

    debug.log('Tooltip Data', tooltips);
    return tooltips;
};

const handleWarningTooltip = (
    tooltipService: ITooltipService,
    settings: VisualSettings
) => {
    const event = getEvent(),
        coordinates = resolveCoordinates(event);
    switch (event.type) {
        case 'mouseover':
        case 'mousemove': {
            tooltipService.show({
                coordinates,
                isTouchEvent,
                identities: null,
                dataItems: getTruncationTooltipData(settings)
            });
            break;
        }
        default: {
            hideTooltip(tooltipService);
        }
    }
};

const hideTooltip = (tooltipService: ITooltipService) => {
    const immediately = true;
    tooltipService.hide({
        immediately,
        isTouchEvent
    });
};

/** Tooltip to display in the event of too many categories for the visual. As we handle this independently of the dataReductionAlgorithm,
 *  we need to indicate this to the user some other way.
 */
const getTruncationTooltipData = (
    settings: VisualSettings
): VisualTooltipDataItem[] => [
    {
        displayName: `Category values limited to ${settings.dataLimit.categoryLimit} unique values for \
                            performance reasons. Not displaying all data. Filter the data or choose another field.`,
        value: ''
    }
];

const resolveCoordinates = (event: MouseEvent): [number, number] => [
    event.clientX,
    event.clientY
];
