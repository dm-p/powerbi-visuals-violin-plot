/*
 *  Power BI Visual CLI
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
    'use strict';

    import visualTransform = ViolinPlotHelpers.visualTransform;
    import VisualDebugger = ViolinPlotHelpers.VisualDebugger;
    import renderViolin = ViolinPlotHelpers.renderViolin;
    import renderBoxPlot = ViolinPlotHelpers.renderBoxPlot;
    
    export class ViolinPlot implements IVisual {
        private element: HTMLElement;
        private container: d3.Selection<{}>;
        private settings: VisualSettings;
        private options: VisualUpdateOptions;
        private colourPalette: ISandboxExtendedColorPalette;
        private defaultColour: string;
        private host: IVisualHost;
        private viewModel: ViolinPlotModels.IViewModel;

        constructor(options: VisualConstructorOptions) {
            this.element = options.element;
            this.colourPalette = options.host.colorPalette;
            this.host = options.host;
            this.defaultColour = this.colourPalette['colors'][0].value;

            /** Visual container */
            this.container = d3.select(options.element)
                .append('svg')
                .classed('violinPlotContainer', true);

        }

        public update(options: VisualUpdateOptions) {
            this.options = options;
            this.settings = ViolinPlot.parseSettings(options && options.dataViews && options.dataViews[0]);

            /** This is a bit hacky, but I wanted to populate the default colour in parseSettings. I could manage it for the properties pane
             *  (and that code remains in-place below) but not in the settings object, so this "coerces" it based on the palette's first 
             *  assigned colour.
             */
                if (!this.settings.dataColours.defaultFillColour) {
                    this.settings.dataColours.defaultFillColour = this.defaultColour;
                }

            /** Initial debugging for visual update */
                let debug = new VisualDebugger(this.settings.about.debugMode && this.settings.about.debugVisualUpdate);
                debug.clear();
                debug.heading('Visual Update');
                debug.log('Settings', this.settings);
                debug.log('Viewport', options.viewport);

            /** Clear down existing plot */
            this.container.selectAll('*').remove();
            
            /** Size our initial container to match the viewport */
            this.container.attr({
                width: `${options.viewport.width}`,
                height: `${options.viewport.height}`,
            });

            this.viewModel = visualTransform(options, this.settings, this.host, this.colourPalette);
            debug.log('View model', this.viewModel);

            /** Create a Y axis */
                if (this.settings.yAxis.show) {

                    let yAxisContainer = this.container
                        .append('g')
                            .classed('yAxisContainer', true)
                            .style({
                                'font-size': this.viewModel.yAxis.labelTextProperties.fontSize,
                                'font-family': this.settings.yAxis.fontFamily,
                                'fill': this.settings.yAxis.fontColor,
                                'stroke-width' : 1 /** TODO: Config */
                            });

                    /** Add title if required */
                        if (this.settings.yAxis.showTitle && this.viewModel.yAxis.titleTextProperties) {
                            yAxisContainer
                                .append('text')
                                    .classed('yAxisTitle', true)
                                    .attr({
                                        transform: 'rotate(-90)',
                                        x: this.viewModel.yAxis.titleDimensions.x,
                                        y: this.viewModel.yAxis.titleDimensions.y,
                                        dy: '1em'
                                    })
                                    .style({
                                        'text-anchor': 'middle',
                                        'font-size': this.viewModel.yAxis.titleTextProperties.fontSize,
                                        'font-family': this.settings.yAxis.titleFontFamily,
                                        'fill': this.settings.yAxis.titleColor,
                                    })
                                    .text(this.viewModel.yAxis.titleTextProperties.text)
                                    /** TODO wrap/ellipsis */
                        }

                    let yAxisTicks = yAxisContainer
                        .append('g')
                            .classed({
                                'yAxis': true,
                                'grid': true
                            })
                            .attr('transform', `translate(${this.viewModel.yAxis.dimensions.width}, 0)`)
                        .call(this.viewModel.yAxis.generator);

                    /** Apply gridline styling */
                        yAxisTicks.selectAll('line')
                            .attr({
                                stroke: this.settings.yAxis.gridlineColor,
                                'stroke-width': this.settings.yAxis.gridlines
                                    ? this.settings.yAxis.gridlineStrokeWidth
                                    : 0
                            })
                            .classed(this.settings.yAxis.gridlineStrokeLineStyle, true);

                }
            
            /** Create an X-axis */
                if (this.settings.xAxis.show) {
                    let xAxisContainer = this.container
                        .append('g')
                        .classed('xAxisContainer', true)
                            .style({
                                'font-size': this.viewModel.xAxis.labelTextProperties.fontSize,
                                'font-family': this.settings.xAxis.fontFamily,
                                'fill': this.settings.xAxis.fontColor,
                                'stroke-width' : 1 /** TODO: Config */
                            });
                    
                    let xAxisTicks = xAxisContainer
                        .append('g')
                            .classed({
                                'xAxis': true,
                                'grid': true
                            })
                            .attr('transform', `translate(${this.viewModel.yAxis.dimensions.width}, ${options.viewport.height - this.viewModel.xAxis.dimensions.height})`)
                        .call(this.viewModel.xAxis.generator);

                    /** Apply gridline styling */
                        xAxisTicks.selectAll('line')
                            .attr({
                                stroke: this.settings.xAxis.gridlineColor,
                                'stroke-width': this.settings.xAxis.gridlines
                                    ? this.settings.xAxis.gridlineStrokeWidth
                                    : 0
                            })
                            .classed(this.settings.xAxis.gridlineStrokeLineStyle, true);

                    /** Add title if required */
                        if (this.settings.xAxis.showTitle && this.viewModel.xAxis.titleTextProperties) {
                            xAxisContainer
                                .append('text')
                                    .classed('xAxisTitle', true)
                                    .attr({
                                        x: this.viewModel.xAxis.titleDimensions.x,
                                        y: this.viewModel.xAxis.titleDimensions.y,
                                        dy: '1em'
                                    })
                                    .style({
                                        'text-anchor': 'middle',
                                        'font-size': this.viewModel.xAxis.titleTextProperties.fontSize,
                                        'font-family': this.settings.xAxis.titleFontFamily,
                                        'fill': this.settings.xAxis.titleColor,
                                    })
                                    .text(this.viewModel.xAxis.titleTextProperties.text)
                                    /** TODO wrap/ellipsis */
                        }

                }

                let seriesContainer = this.container.selectAll('.violinPlotContainer')
                    .data(this.viewModel.categories)
                    .enter()
                    .append('g')
                        .classed({
                            'violinPlotSeries': true
                        })
                        .attr({
                            'transform': (d) => `translate(${this.viewModel.xAxis.scale(d.name) + this.viewModel.yAxis.dimensions.width}, 0)`,
                            'width': this.viewModel.xAxis.scale.rangeBand()
                        });

            /** Violin plot */
                renderViolin(seriesContainer, this.viewModel, this.settings);

            /** Box plot */
                if (this.settings.boxPlot.show) {
                    renderBoxPlot(seriesContainer, this.viewModel, this.settings);
                }

            /** Success! */
            if (debug) {
                debug.log('Visual fully rendered!');
                debug.footer();
            }

        }

        private static parseSettings(dataView: DataView): VisualSettings {
            return VisualSettings.parse(dataView) as VisualSettings;
        }

        /** 
         * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the 
         * objects and properties you want to expose to the users in the property pane.
         * 
         */
        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
            const instances: VisualObjectInstance[] = (VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options) as VisualObjectInstanceEnumerationObject).instances;
            let objectName = options.objectName;

            /** Initial debugging for properties update */
                let debug = new VisualDebugger(this.settings.about.debugMode && this.settings.about.debugProperties);
                debug.heading(`Properties: ${objectName}`);

            /** Apply instance-specific transformations */
                switch (objectName) {
                    case 'about' : {
                        /** Switch off and hide debug mode if development flag is disabled */
                            if(!this.settings.about.development) {
                                delete instances[0].properties['debugMode'];
                                delete instances[0].properties['debugVisualUpdate'];
                                delete instances[0].properties['debugProperties'];
                            }
                        /** Reset the individual flags if debug mode switched off */
                            if(!this.settings.about.debugMode) {
                                instances[0].properties['debugMode'] = false;
                                instances[0].properties['debugVisualUpdate'] = false;
                                instances[0].properties['debugProperties'] = false;
                            }
                            break;
                    }
                    case 'violin': {
                        /** Range validation on stroke width */
                            instances[0].validValues = instances[0].validValues || {};
                            instances[0].validValues.strokeWidth = {
                                numberRange: {
                                    min: 1,
                                    max: 5
                                },
                            };
                        /** Range validation on inner padding (0% - 50%) */
                            instances[0].validValues.innerPadding = {
                                numberRange: {
                                    min: 0,
                                    max: 50
                                }
                            };
                        /** Enable options for different violin types (currently only line) */
                            if (this.settings.violin.type !== 'line') {
                                delete instances[0].properties['strokeWidth'];
                                delete instances[0].properties['clamp'];
                                delete instances[0].properties['lineType'];
                                delete instances[0].properties['resolution'];
                                delete instances[0].properties['kernel'];
                                delete instances[0].properties['specifyBandwidth'];
                            }
                        /** Manual bandwidth toggle */
                            if (!this.settings.violin.specifyBandwidth) {
                                delete instances[0].properties['bandwidth'];
                            };
                        break;
                    }
                    case 'dataColours': {
                        /** Assign default theme colour from palette if default fill colour not overridden */
                            if (!this.settings.dataColours.defaultFillColour) {
                                instances[0].properties['defaultFillColour'] = this.defaultColour;
                            }
                        /** If there are no categories, don't offer the option to colour by them */
                            if (!this.options.dataViews[0].metadata.columns.filter(c => c.roles['category'])[0]) {
                                delete instances[0].properties['colourByCategory'];
                                this.settings.dataColours.colourByCategory = false; /** This prevents us losing the default fill if we remove the field afterward */
                            }
                        /** Add categories if we want to colour by them */
                            if (this.settings.dataColours.colourByCategory) {
                                delete instances[0].properties['defaultFillColour'];
                                for (let category of this.viewModel.categories) {
                                    instances.push({
                                        objectName: objectName,
                                        displayName: category.name,
                                        properties: {
                                            categoryFillColour: {
                                                solid: {
                                                    color: category.colour
                                                }
                                            }
                                        },
                                        selector: category.selectionId.getSelector()
                                    });
                                }
                            }
                        break;
                    }
                    case 'xAxis': {
                        /** Label toggle */
                            if (!this.settings.xAxis.showLabels) {
                                delete instances[0].properties['fontColor'];
                                delete instances[0].properties['fontSize'];
                                delete instances[0].properties['fontFamily'];
                            }     
                        /** Gridline toggle */
                            if (!this.settings.xAxis.gridlines) {
                                delete instances[0].properties['gridlineColor'];
                                delete instances[0].properties['gridlineStrokeWidth'];
                                delete instances[0].properties['gridlineStrokeLineStyle'];
                            }
                        /** Title toggle */
                            if (!this.settings.xAxis.showTitle) {
                                delete instances[0].properties['titleColor'];
                                delete instances[0].properties['titleText'];
                                delete instances[0].properties['titleFontSize'];
                                delete instances[0].properties['titleFontFamily'];
                            }
                        /** Range validation on grid line stroke width */
                            instances[0].validValues = instances[0].validValues || {};
                            instances[0].validValues.gridlineStrokeWidth = {
                                numberRange: {
                                    min: 1,
                                    max: 5
                                },
                            };
                        break;
                    }
                    case 'yAxis': {
                        /** Label toggle */
                            if (!this.settings.yAxis.showLabels) {
                                delete instances[0].properties['fontColor'];
                                delete instances[0].properties['fontSize'];
                                delete instances[0].properties['fontFamily'];
                                delete instances[0].properties['labelDisplayUnits'];
                                delete instances[0].properties['precision'];
                            }                    
                        /** Gridline toggle */
                            if (!this.settings.yAxis.gridlines) {
                                delete instances[0].properties['gridlineColor'];
                                delete instances[0].properties['gridlineStrokeWidth'];
                                delete instances[0].properties['gridlineStrokeLineStyle'];
                            }
                        /** Title toggle */
                            if (!this.settings.yAxis.showTitle) {
                                delete instances[0].properties['titleStyle'];
                                delete instances[0].properties['titleColor'];
                                delete instances[0].properties['titleText'];
                                delete instances[0].properties['titleFontSize'];
                                delete instances[0].properties['titleFontFamily'];
                            }
                        /** Title style toggle if units are none */
                            if (this.settings.yAxis.labelDisplayUnits == 1) {
                                instances[0].properties['titleStyle'] = 'title'; /** TODO: Delete entries from list */
                            }
                        /** Range validation on grid line stroke width and precision */
                            instances[0].validValues = instances[0].validValues || {};
                            instances[0].validValues.precision = {
                                numberRange: {
                                    min: 0,
                                    max: 10
                                }
                            };
                            instances[0].validValues.gridlineStrokeWidth = {
                                numberRange: {
                                    min: 1,
                                    max: 5
                                },
                            };
                        break;
                    }
                }

            /** Output all transformed instance info if we're debugging */
                instances.map(function (instance) {
                    debug.log(instance.objectName, instance);
                });
                debug.log('Properties fully processed!');
                debug.footer();

            return instances;
        }
    }
}