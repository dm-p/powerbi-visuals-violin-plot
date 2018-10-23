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

    import axisHelper = powerbi.extensibility.utils.chart.axis;
    import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import ValueType = powerbi.extensibility.utils.type.ValueType;
    import visualTransform = ViolinPlotHelpers.visualTransform;
    import VisualDebugger = ViolinPlotHelpers.VisualDebugger;

    export class ViolinPlot implements IVisual {
        private element: HTMLElement;
        private container: d3.Selection<{}>;
        private settings: VisualSettings;

        constructor(options: VisualConstructorOptions) {
            this.element = options.element;

            /** Visual container */
            this.container = d3.select(options.element)
                .append('svg')
                .classed('violinPlotContainer', true);

        }

        public update(options: VisualUpdateOptions) {
            this.settings = ViolinPlot.parseSettings(options && options.dataViews && options.dataViews[0]);

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

            let viewModel = visualTransform(options, this.settings);
            debug.log('View model', viewModel);

            /** Create a Y axis */
                if (this.settings.yAxis.show) {

                    let yAxisContainer = this.container
                        .append('g')
                            .classed('yAxisContainer', true)
                            .style({
                                'font-size': viewModel.yAxis.labelTextProperties.fontSize,
                                'font-family': this.settings.yAxis.fontFamily,
                                'fill': this.settings.yAxis.fontColor,
                                'stroke-width' : 1 /** TODO: Config */
                            });

                    /** Add title if required */
                        if (this.settings.yAxis.showTitle && viewModel.yAxis.titleTextProperties) {
                            yAxisContainer
                                .append('text')
                                    .classed('yAxisTitle', true)
                                    .attr({
                                        transform: 'rotate(-90)',
                                        x: viewModel.yAxis.titleDimensions.x,
                                        y: viewModel.yAxis.titleDimensions.y,
                                        dy: '1em'
                                    })
                                    .style({
                                        'text-anchor': 'middle',
                                        'font-size': viewModel.yAxis.titleTextProperties.fontSize,
                                        'font-family': this.settings.yAxis.titleFontFamily,
                                        'fill': this.settings.yAxis.titleColor,
                                    })
                                    .text(viewModel.yAxis.titleTextProperties.text)
                                    /** TODO wrap/ellipsis */
                        }

                    let yAxisTicks = yAxisContainer
                        .append('g')
                            .classed({
                                'yAxis': true,
                                'grid': true
                            })
                            .attr('transform', `translate(${viewModel.yAxis.dimensions.width}, 0)`)
                        .call(viewModel.yAxis.generator);

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
                                'font-size': viewModel.xAxis.labelTextProperties.fontSize,
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
                            .attr('transform', `translate(${viewModel.yAxis.dimensions.width}, ${options.viewport.height - viewModel.xAxis.dimensions.height})`)
                        .call(viewModel.xAxis.generator);
                }

                let seriesContainer = this.container.selectAll('.violinPlotContainer')
                    .data(viewModel.categories)
                    .enter()
                    .append('g')
                        .classed({
                            'violinPlotSeries': true
                        })
                        .attr({
                            'transform': (d) => `translate(${viewModel.xAxis.scale(d.name) + viewModel.yAxis.dimensions.width}, 0)`,
                            'width': viewModel.xAxis.scale.rangeBand()
                        });

            /** Violin plot */
                let gLeft = seriesContainer.append('g')
                    .classed({
                        'violinPlotViolin': true,
                        'left': true
                    })
                    .attr({
                        'transform': `rotate(90, 0, 0) translate(0, -${viewModel.xAxis.scale.rangeBand() / 2})`
                    })
                    .append('path')
                        .classed({
                            'violinPlotViolinLine': true
                        })
                        .attr('d', d => d.lineGen(d.dataKde))
                        .style({
                            'fill': 'none',
                            'stroke': 'grey'
                        });

                let gRight = seriesContainer.append('g')
                    .classed({
                        'violinPlotViolin': true,
                        'right': true
                    })
                    .attr({
                        'transform': `rotate(90, 0, 0) translate(0, -${viewModel.xAxis.scale.rangeBand() / 2}) scale(1, -1)`
                    })
                    .append('path')
                        .classed({
                            'violinPlotViolinLine': true
                        })
                        .attr('d', d => d.lineGen(d.dataKde))
                        .style({
                            'fill': 'none',
                            'stroke': 'grey'
                        });

            /** Box plot */
                let boxPlotWidth = 15; /** TODO into view model */
                let xLeft = (viewModel.xAxis.scale.rangeBand() / 2) - (boxPlotWidth / 2),
                    xRight = (viewModel.xAxis.scale.rangeBand() / 2) + (boxPlotWidth / 2)

                seriesContainer.append('rect')
                    .classed({
                        'violinPlotBoxPlot': true,
                        'box': true
                    })
                    .attr({
                        'x': xLeft,
                        'y': (d) => viewModel.yAxis.scale(d.statistics.quartile3),
                        'width': boxPlotWidth,
                        'height': (d) => -viewModel.yAxis.scale(d.statistics.quartile3) + viewModel.yAxis.scale(d.statistics.quartile1)
                    });

                /** Do the whiskers - we'll repeat this for now and try to optimise later on. We should also allow toggle on the whiskers */
                let whiskerStyle = {
                        'fill': 'black',
                        'stroke': 'black'
                    },
                    whiskerClasses = {
                        'violinPlotBoxPlot': true,
                        'whisker': true
                    },
                    medianStyle = {
                        'fill': 'white',
                        'stroke': 'white'
                    }

                seriesContainer.append('line')
                    .classed(whiskerClasses)
                    .classed('upper', true)
                    .attr({
                        'x1': xLeft,
                        'x2': xRight,
                        'y1': (d) => viewModel.yAxis.scale(d.statistics.confidenceUpper),
                        'y2': (d) => viewModel.yAxis.scale(d.statistics.confidenceUpper)
                    })
                    .style(whiskerStyle);

                seriesContainer.append('line')
                    .classed(whiskerClasses)
                    .classed('lower', true)
                    .attr({
                        'x1': xLeft,
                        'x2': xRight,
                        'y1': (d) => viewModel.yAxis.scale(d.statistics.confidenceLower),
                        'y2': (d) => viewModel.yAxis.scale(d.statistics.confidenceLower)
                    })
                    .style(whiskerStyle)

                seriesContainer.append('line')
                    .classed(whiskerClasses)
                    .classed('range', true)
                    .attr({
                        'x1': (viewModel.xAxis.scale.rangeBand() / 2),
                        'x2': (viewModel.xAxis.scale.rangeBand() / 2),
                        'y1': (d) => viewModel.yAxis.scale(d.statistics.confidenceLower),
                        'y2': (d) => viewModel.yAxis.scale(d.statistics.confidenceUpper)
                    })
                    .style(whiskerStyle);

                /** Mean and median */
                seriesContainer.append('line')
                    .classed({
                        'violinPlotBoxPlot': true,
                        'median': true
                    })
                    .attr({
                        'x1': xLeft,
                        'x2': xRight,
                        'y1': (d) => viewModel.yAxis.scale(d.statistics.median),
                        'y2': (d) => viewModel.yAxis.scale(d.statistics.median)
                    })
                    .style(medianStyle);

                seriesContainer.append('circle')
                    .classed({
                        'violinPlotBoxPlot': true,
                        'mean': true,
                        'outer': true
                    })
                    .attr({
                        'cx': (viewModel.xAxis.scale.rangeBand() / 2),
                        'cy': (d) => viewModel.yAxis.scale(d.statistics.mean),
                        'r': boxPlotWidth / 5
                    })
                    .style({
                        'fill': 'white',
                        'stroke': 'none'
                    });
                seriesContainer.append('circle')
                    .classed({
                        'violinPlotBoxPlot': true,
                        'mean': true,
                        'inner': true
                    })
                    .attr({
                        'cx': (viewModel.xAxis.scale.rangeBand() / 2),
                        'cy': (d) => viewModel.yAxis.scale(d.statistics.mean),
                        'r': boxPlotWidth / 10
                    })
                    .style({
                        'fill': 'black',
                        'stroke': 'none'
                    });

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