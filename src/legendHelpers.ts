module powerbi.extensibility.visual {

    /** powerbi.extensibility.utils.chart.legend */
        import ILegend = powerbi.extensibility.utils.chart.legend.ILegend;
        import Legend = powerbi.extensibility.utils.chart.legend;
        import LegendData = powerbi.extensibility.utils.chart.legend.LegendData;
        import LegendIcon = powerbi.extensibility.utils.chart.legend.LegendIcon;
        import LegendPosition = powerbi.extensibility.utils.chart.legend.LegendPosition;

    /** powerbi.extensibility.utils.type */
        import PixelConverter = powerbi.extensibility.utils.type.PixelConverter;

    /** powerbi.extensibility.utils.formatting */
        import textMeasurementService = powerbi.extensibility.utils.formatting.textMeasurementService;

    /** ViolinPlotModels */
        import IViewModel = ViolinPlotModels.IViewModel;

    export module ViolinPlotHelpers {

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

            constructor(errorState: boolean, container: d3.Selection<{}>, legend: ILegend, viewport: IViewport, viewModel: IViewModel, settings: VisualSettings, host: IVisualHost) {
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
             *  Build the `LegendData` for the visual. We previoulsy used to do this if there were multiple category values, and the user
             *  had specified to colour by category. We had some feedback (#65) that showed it would be good to include the additional
             *  annotations to the violin (median, mean, quartiles & data points), so we artifically create these here and then do some
             *  post-processing on these afterwards.
             * 
             *  @param viewModel                                - View model object to use for processing
             *  @param settings                                 - Settings object to use for processing
             *  @param host                                     - Visual host
             */
                private constructLegendData() {
                
                    let measureOnly = (!this.viewModel.categoryNames || !this.settings.dataColours.colourByCategory);

                    this.debug.log('Creating legend data...');

                    /** Instantiate bare-minimum legend data */
                        let legendData = {
                                title: this.settings.legend.showTitle
                                    ?   this.settings.legend.titleText
                                        ?   this.settings.legend.titleText
                                        :   measureOnly
                                                ?   null
                                                :   this.viewModel.dataViewMetadata.categoryDisplayName
                                    :   null,
                                fontSize: this.settings.legend.fontSize,
                                labelColor: this.settings.legend.fontColor,
                                dataPoints: []
                            } as LegendData;

                    if (!this.errorState && this.settings.dataPoints.show) {

                        /** If colouring by category, push in the individual values, or group */
                            if (measureOnly) {
                                legendData.dataPoints = [{
                                    label: `${this.viewModel.dataViewMetadata.measureDisplayName}`,
                                    color: this.settings.dataColours.defaultFillColour,
                                    icon: LegendIcon.Circle,
                                    selected: false,
                                    identity: this.viewModel.categories[0].selectionId
                                }];
                            } else {
                                legendData.dataPoints = this.viewModel.categories.map(c => (
                                    {
                                        label: c.displayName.formattedName,
                                        color: c.colour,
                                        icon: LegendIcon.Circle,
                                        selected: false,
                                        identity: c.selectionId
                                    }
                                ))
                            }

                        /** Add specific items for violin annotations (we'll clean up afterwards) */

                            /** Spacer (to allow us to provide a small amount of spacing) */
                                legendData.dataPoints.push({
                                    label: this.settings.legend.spacerText,
                                    color: '#000000',
                                    icon: LegendIcon.Circle,
                                    selected: false,
                                    identity: this.host.createSelectionIdBuilder()
                                        .withMeasure(this.settings.legend.spacerText)
                                        .createSelectionId()
                                });
                        
                            /** Barcode plot specifics */
                                if (this.settings.dataPoints.plotType == 'barcodePlot') {
                                    
                                    /** Data points */
                                        legendData.dataPoints.push({
                                            label: this.viewModel.legend.dataPointText,
                                            color: '#000000',
                                            icon: LegendIcon.Circle,
                                            selected: false,
                                            identity: this.host.createSelectionIdBuilder()
                                                .withMeasure(this.viewModel.legend.dataPointText)
                                                .createSelectionId()
                                        });

                                }

                            /** Quartiles */
                                if (this.settings.dataPoints.showQuartiles && this.settings.dataPoints.plotType != 'boxPlot') {
                                    if (this.viewModel.legend.quartilesMatch) {
                                        legendData.dataPoints.push({
                                            label: this.viewModel.legend.quartileCombinedText,
                                            color: '#000000',
                                            icon: LegendIcon.Circle,
                                            selected: false,
                                            identity: this.host.createSelectionIdBuilder()
                                                .withMeasure(this.viewModel.legend.quartileCombinedText)
                                                .createSelectionId()
                                        });     
                                    } else {
                                        legendData.dataPoints.push({
                                            label: this.viewModel.legend.quartile1Text,
                                            color: '#000000',
                                            icon: LegendIcon.Circle,
                                            selected: false,
                                            identity: this.host.createSelectionIdBuilder()
                                                .withMeasure(this.viewModel.legend.quartile1Text)
                                                .createSelectionId()
                                        },
                                        {
                                            label: this.viewModel.legend.quartile3Text,
                                            color: '#000000',
                                            icon: LegendIcon.Circle,
                                            selected: false,
                                            identity: this.host.createSelectionIdBuilder()
                                                .withMeasure(this.viewModel.legend.quartile3Text)
                                                .createSelectionId()
                                        });
                                    }

                                }

                            /** Median */
                                if (this.settings.dataPoints.showMedian) {
                                    legendData.dataPoints.push({
                                        label: this.viewModel.legend.medianText,
                                        color: '#000000',
                                        icon: LegendIcon.Circle,
                                        selected: false,
                                        identity: this.host.createSelectionIdBuilder()
                                            .withMeasure(this.viewModel.legend.medianText)
                                            .createSelectionId()
                                    });
                                }

                            /** Mean */
                                if (this.settings.dataPoints.plotType != 'barcodePlot' && this.settings.dataPoints.showMean) {
                                    legendData.dataPoints.push({
                                        label: this.viewModel.legend.meanText,
                                        color: '#000000',
                                        icon: LegendIcon.Circle,
                                        selected: false,
                                        identity: this.host.createSelectionIdBuilder()
                                            .withMeasure(this.viewModel.legend.meanText)
                                            .createSelectionId()
                                    });
                                }

                    }

                    this.debug.log('Legend data instantiated.');
                        
                    this.data = legendData;

                }

            /**
             *  Manage position based on our settings
             */
                private positionLegend() {
                    this.position = this.settings.legend.show 
                        && !this.errorState 
                            ?   LegendPosition[this.settings.legend.position]
                            :   LegendPosition.None;
                    this.debug.log(`Position: ${LegendPosition[this.position]}`);
                }

            /**
             *  If the legend exceeds our limits for responsiveness, we will need to hide and re-draw. We also make the necessary adjustments
             *  to the viewport to cater for the legend. We will need to update the view model from the calling visual update so that it
             *  will render correctly.
             */
                private fixViewportForLegend() {
                    this.debug.log('Checking legend position...');
                
                    /** If this exceeds our limits, then we will hide and re-draw prior to render */
                        let legendBreaksViewport = false;
                        switch (this.legend.getOrientation()) {
                            case LegendPosition.Left:
                            case LegendPosition.LeftCenter:
                            case LegendPosition.Right:
                            case LegendPosition.RightCenter:
                                legendBreaksViewport = 
                                        (this.newViewport.width - this.legend.getMargins().width < this.settings.legend.widthLimit)
                                    ||  (this.newViewport.height < this.settings.legend.heightLimit);
                                break;
                            case LegendPosition.Top:
                            case LegendPosition.TopCenter:
                            case LegendPosition.Bottom:
                            case LegendPosition.BottomCenter:
                                legendBreaksViewport =         
                                        (this.newViewport.height - this.legend.getMargins().height < this.settings.legend.heightLimit)
                                    ||  (this.newViewport.width < this.settings.legend.widthLimit);
                                break;
                        }

                    /** Adjust viewport (and hide legend) as appropriate */
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
                        Legend.positionChartArea(this.container, this.legend);
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
             *  TODO: Solve for vertical legends
             *  TODO: Shape/colour transforms
             */
                private fixLegendIcons() {
                    this.debug.log('Fixing up legend icons for new shapes...');
                    let vl = this;

                    d3.selectAll('.customLegendIcon')
                        .remove();
                    d3.selectAll('.legendItem').each(function(d, i) {

                        /** Element and positioning */
                            let node = d3.select(this),
                                icon = node.select('.legendIcon'),
                                text = node.select('.legendText'),
                                radius = Number(icon.attr('r')),
                                hiddenIconAttributes = {
                                    'visibility': 'hidden'
                                },
                                boxStrokeWidth = 1,
                                boxAttributes = {
                                    'x': d.glyphPosition.x - radius,
                                    'y': d.glyphPosition.y - radius,
                                    'width': radius * 2,
                                    'height': radius * 2,
                                    'stroke': vl.viewModel.legend.boxColour,
                                    'stroke-width': `1px`,
                                    'fill': vl.viewModel.legend.boxColour,
                                    'fill-opacity': vl.viewModel.legend.boxOpacity
                                };
                        
                        vl.debug.log('Legend point data', d);
                        switch(d.tooltip) {

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

                                let strokeLineStyle,
                                    stroke,
                                    className;

                                switch (d.tooltip) {
                                    case vl.viewModel.legend.medianText:
                                        vl.debug.log('Median info: re-style');
                                        className = 'median';
                                        strokeLineStyle = vl.settings.dataPoints[`medianStrokeLineStyle`];
                                        stroke = vl.settings.dataPoints.medianFillColour;
                                        break;
                                    case vl.viewModel.legend.quartileCombinedText:
                                        vl.debug.log('Quartiles (combined): re-style');
                                        className = 'quartilesCombined';
                                        strokeLineStyle = vl.settings.dataPoints[`quartile1StrokeLineStyle`];
                                        stroke = vl.settings.dataPoints.quartile1FillColour;
                                        break;
                                    case vl.viewModel.legend.quartile1Text:
                                        vl.debug.log('Quartile 1: re-style');
                                        className = 'quartile1';
                                        strokeLineStyle = vl.settings.dataPoints[`quartile1StrokeLineStyle`];
                                        stroke = vl.settings.dataPoints.quartile1FillColour;
                                        break;
                                    case vl.viewModel.legend.quartile3Text:
                                        vl.debug.log('Quartile 3: re-style');
                                        className = 'quartile3';
                                        strokeLineStyle = vl.settings.dataPoints[`quartile3StrokeLineStyle`];
                                        stroke = vl.settings.dataPoints.quartile3FillColour;
                                        break;
                                    default:
                                        vl.debug.log('Chart line: not catered for yet. Using defaults.')
                                        className = 'unknown';
                                        strokeLineStyle = 'solid';
                                        stroke = '#000000';
                                        break;
                                }

                                icon.attr(hiddenIconAttributes);
                                node
                                    .append('rect')
                                        .classed('customLegendIcon', true)
                                        .attr(boxAttributes);
                                node
                                    .append('line')
                                        .classed('customLegendIcon', true)
                                        .classed(className, true)
                                        .classed(strokeLineStyle, true)
                                        .attr({
                                            'x1': d.glyphPosition.x - radius + boxStrokeWidth,
                                            'x2': d.glyphPosition.x + radius - boxStrokeWidth,
                                            'y1': d.glyphPosition.y,
                                            'y2': d.glyphPosition.y
                                        })
                                        .style({
                                            'stroke': stroke,
                                            'stroke-width': 2
                                        });
                                break;

                            case vl.viewModel.legend.meanText:
                                vl.debug.log('Mean info: re-style');
                                icon.attr(hiddenIconAttributes);
                                node
                                    .append('rect')
                                        .classed('customLegendIcon', true)
                                        .attr(boxAttributes);
                                node
                                    .append('circle')
                                        .classed('customLegendIcon', true)
                                        .attr({
                                            'cx': d.glyphPosition.x,
                                            'cy': d.glyphPosition.y,
                                            'r': radius - (boxStrokeWidth * 2)
                                        })
                                        .style({
                                            'fill': vl.settings.dataPoints.meanFillColourInner,
                                            'stroke': vl.settings.dataPoints.meanFillColour,
                                            'stroke-width': 2
                                        });
                                break;

                            case vl.viewModel.legend.dataPointText:
                                vl.debug.log('Data Point info: re-style');
                                icon.attr(hiddenIconAttributes);
                                node
                                    .append('line')
                                        .classed('customLegendIcon', true)
                                        .classed('dataPoint', true)
                                        .attr({
                                            'x1': d.glyphPosition.x - radius,
                                            'x2': d.glyphPosition.x + radius,
                                            'y1': d.glyphPosition.y,
                                            'y2': d.glyphPosition.y
                                        })
                                        .style({
                                            'stroke': `${vl.settings.dataPoints.barColour}`,
                                            'stroke-width': 2
                                        });
                                break;

                            default:
                                vl.debug.log('Violin series: re-style');
                                icon.attr(hiddenIconAttributes);
                                node
                                    .append('path')
                                        .classed('customLegendIcon', true)
                                        .attr({
                                            'd': /** This draws a violin-like shape based on the radius */ 
                                                `  M${radius},-${radius}\
                                                    C${radius},${radius} -${radius},${radius} ${radius},${radius * 2}\
                                                    C${radius * 3},${radius} ${radius},${radius} ${radius},-${radius}`,
                                            'transform': `translate(${d.glyphPosition.x - radius}, ${d.glyphPosition.y - radius})`
                                        })
                                        .style({
                                            'fill': icon.style('fill'),
                                            'transform-origin': 'top center',
                                            'width': '10px',
                                            'height': '10px'
                                        });
                                break;
                        }

                    });

                }

        }

    }

}