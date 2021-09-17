import powerbi from 'powerbi-visuals-api';
import DataView = powerbi.DataView;
import DataViewMetadata = powerbi.DataViewMetadata;

export const getMetadataByRole = (metadata: DataViewMetadata, role: string) =>
    metadata.columns.find(c => c.roles[role]) || null;

export const isNumberTruthy = (value: number) => value || value === 0;

export const shouldNotMapData = (dataViews: DataView[]) =>
    !dataViews ||
    !dataViews[0] ||
    !dataViews[0].categorical ||
    !dataViews[0].categorical.values ||
    !dataViews[0].metadata;
