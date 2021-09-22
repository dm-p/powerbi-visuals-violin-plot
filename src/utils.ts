import powerbi from 'powerbi-visuals-api';
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import DataViewMetadata = powerbi.DataViewMetadata;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import { valueFormatter } from 'powerbi-visuals-utils-formattingutils';

import { reduce } from 'lodash';

export const getMetadataByRole = (metadata: DataViewMetadata, role: string) =>
    metadata.columns.find(c => c.roles[role]) || null;

export const isNumberTruthy = (value: number) => value || value === 0;

export const shouldNotMapData = (dataViews: DataView[]) =>
    !dataViews ||
    !dataViews[0] ||
    !dataViews[0].categorical ||
    !dataViews[0].categorical.values ||
    !dataViews[0].metadata;

export const dataViewBreaksLimit = (metadata: DataViewMetadata) => (metadata?.segment && true) || false;

export const displayWindowCapWarning = (host: IVisualHost, i18n: ILocalizationManager, rowCount: number) => {
    host.displayWarningIcon(
        i18nValue(i18n, 'Warning_DataLimitFetch_Title', [getFormattedRowCount(rowCount, host.locale)]),
        i18nValue(i18n, 'Warning_DataLimitFetch_Description')
    );
};

export const i18nValue = (i18n: ILocalizationManager, key: string, tokens: (string | number)[] = []) =>
    reduce(
        tokens,
        (prev, value, idx) => {
            return prev.replace(`{${idx}}`, `${value}`);
        },
        i18n.getDisplayName(key)
    );

export const getFormattedRowCount = (totalRows: number, locale: string) =>
    valueFormatter
        .create({
            format: '#,##0',
            value: totalRows,
            cultureSelector: locale
        })
        .format(totalRows);
