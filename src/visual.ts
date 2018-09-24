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
            let debug = this.settings.about.debugMode && this.settings.about.debugVisualUpdate;
            if (debug) {
                console.clear();
                console.log('\n====================');
                console.log('Visual Update');
                console.log('====================');
                console.log('|\tSettings', this.settings);
                console.log('|\tViewport (pre-legend)', options.viewport);
            }

            interface IStaticData {
                date: number,
                value: number
            }
            let staticData: IStaticData[] = [
                {
                    "date": 2000,
                    "value": 208.4968974
                },
                {
                    "date": 2000,
                    "value": 160.5328879
                },
                {
                    "date": 2002,
                    "value": 292.3321976
                },
                {
                    "date": 1998,
                    "value": 95.07969441
                },
                {
                    "date": 2001,
                    "value": 251.6346499
                },
                {
                    "date": 1996,
                    "value": 4.723143097
                },
                {
                    "date": 1997,
                    "value": 221.3608926
                },
                {
                    "date": 2002,
                    "value": 257.5135771
                },
                {
                    "date": 1999,
                    "value": 256.6401961
                },
                {
                    "date": 1998,
                    "value": 20.19655313
                },
                {
                    "date": 2000,
                    "value": 280.5287882
                },
                {
                    "date": 2002,
                    "value": 195.5122557
                },
                {
                    "date": 1998,
                    "value": 177.9101782
                },
                {
                    "date": 1998,
                    "value": 35.8381779
                },
                {
                    "date": 1997,
                    "value": 157.4465176
                },
                {
                    "date": 1999,
                    "value": 134.3793597
                },
                {
                    "date": 1997,
                    "value": 150.604782
                },
                {
                    "date": 1996,
                    "value": -163.8499657
                },
                {
                    "date": 1997,
                    "value": 137.4253423
                },
                {
                    "date": 2001,
                    "value": 142.7192938
                },
                {
                    "date": 1999,
                    "value": 180.7018929
                },
                {
                    "date": 1998,
                    "value": 115.9725529
                },
                {
                    "date": 1999,
                    "value": 209.3638088
                },
                {
                    "date": 1998,
                    "value": 67.84781771
                },
                {
                    "date": 1996,
                    "value": 175.231925
                },
                {
                    "date": 2002,
                    "value": 51.47799284
                },
                {
                    "date": 1999,
                    "value": 188.9962324
                },
                {
                    "date": 1996,
                    "value": -48.35468425
                },
                {
                    "date": 1997,
                    "value": 169.423597
                },
                {
                    "date": 1998,
                    "value": -53.22055537
                },
                {
                    "date": 1997,
                    "value": 292.1632604
                },
                {
                    "date": 2001,
                    "value": 136.4384768
                },
                {
                    "date": 2002,
                    "value": 321.5455618
                },
                {
                    "date": 1999,
                    "value": 53.06249276
                },
                {
                    "date": 2002,
                    "value": 340.8281495
                },
                {
                    "date": 2002,
                    "value": 130.9466336
                },
                {
                    "date": 2002,
                    "value": 286.8816131
                },
                {
                    "date": 2000,
                    "value": 176.4176712
                },
                {
                    "date": 1998,
                    "value": 191.6883802
                },
                {
                    "date": 2001,
                    "value": 150.0037128
                },
                {
                    "date": 2000,
                    "value": 197.7215175
                },
                {
                    "date": 2001,
                    "value": 305.2651151
                },
                {
                    "date": 1999,
                    "value": 210.168763
                },
                {
                    "date": 2001,
                    "value": 115.5839981
                },
                {
                    "date": 1998,
                    "value": 175.7373095
                },
                {
                    "date": 1999,
                    "value": 116.9958817
                },
                {
                    "date": 1998,
                    "value": 154.8568107
                },
                {
                    "date": 1996,
                    "value": 14.6993532
                },
                {
                    "date": 2001,
                    "value": 198.5466972
                },
                {
                    "date": 1999,
                    "value": 74.15721631
                },
                {
                    "date": 1996,
                    "value": 114.734763
                },
                {
                    "date": 1999,
                    "value": 102.2094761
                },
                {
                    "date": 1998,
                    "value": 177.7200953
                },
                {
                    "date": 2002,
                    "value": 135.5771092
                },
                {
                    "date": 2002,
                    "value": 262.2642028
                },
                {
                    "date": 2001,
                    "value": 146.5137898
                },
                {
                    "date": 1998,
                    "value": 157.1558524
                },
                {
                    "date": 2002,
                    "value": 100.7217744
                },
                {
                    "date": 1999,
                    "value": 215.9330216
                },
                {
                    "date": 1998,
                    "value": 77.73977658
                },
                {
                    "date": 2002,
                    "value": 307.4118429
                },
                {
                    "date": 2002,
                    "value": 183.3339337
                },
                {
                    "date": 1999,
                    "value": 197.9264315
                },
                {
                    "date": 1996,
                    "value": 17.60508917
                },
                {
                    "date": 1996,
                    "value": 210.2650095
                },
                {
                    "date": 1996,
                    "value": -61.72121173
                },
                {
                    "date": 1996,
                    "value": 114.4151786
                },
                {
                    "date": 2002,
                    "value": 137.0691326
                },
                {
                    "date": 1996,
                    "value": 196.452651
                },
                {
                    "date": 1996,
                    "value": -93.70487623
                },
                {
                    "date": 1996,
                    "value": 94.04043151
                },
                {
                    "date": 2002,
                    "value": 243.9383793
                },
                {
                    "date": 1998,
                    "value": 185.4923709
                },
                {
                    "date": 2001,
                    "value": 86.83137214
                },
                {
                    "date": 1997,
                    "value": 189.7194604
                },
                {
                    "date": 1999,
                    "value": 107.6012989
                },
                {
                    "date": 1997,
                    "value": 111.3635375
                },
                {
                    "date": 1996,
                    "value": -18.48801027
                },
                {
                    "date": 2001,
                    "value": 284.114423
                },
                {
                    "date": 1998,
                    "value": 25.03677561
                },
                {
                    "date": 2001,
                    "value": 194.6109073
                },
                {
                    "date": 2002,
                    "value": 222.8485575
                },
                {
                    "date": 2001,
                    "value": 269.0836685
                },
                {
                    "date": 1997,
                    "value": 42.56959913
                },
                {
                    "date": 2002,
                    "value": 263.6498678
                },
                {
                    "date": 2002,
                    "value": 141.9210707
                },
                {
                    "date": 1996,
                    "value": 108.4558658
                },
                {
                    "date": 2000,
                    "value": 136.6209948
                },
                {
                    "date": 1998,
                    "value": 172.4753343
                },
                {
                    "date": 1999,
                    "value": 147.918509
                },
                {
                    "date": 1998,
                    "value": 153.3322857
                },
                {
                    "date": 2000,
                    "value": 165.9668168
                },
                {
                    "date": 1999,
                    "value": 177.2947913
                },
                {
                    "date": 2002,
                    "value": -74.31511032
                },
                {
                    "date": 2002,
                    "value": 335.3878377
                },
                {
                    "date": 1999,
                    "value": 87.78180299
                },
                {
                    "date": 2001,
                    "value": 256.9765118
                },
                {
                    "date": 2000,
                    "value": 156.3968699
                },
                {
                    "date": 1998,
                    "value": 187.2355674
                },
                {
                    "date": 1996,
                    "value": 26.95490135
                },
                {
                    "date": 1996,
                    "value": 205.3224574
                },
                {
                    "date": 1996,
                    "value": -146.8977273
                },
                {
                    "date": 1997,
                    "value": 111.4247665
                },
                {
                    "date": 1997,
                    "value": 39.31960853
                },
                {
                    "date": 1998,
                    "value": 165.4031941
                },
                {
                    "date": 2001,
                    "value": 76.54635096
                },
                {
                    "date": 2000,
                    "value": 211.4411524
                },
                {
                    "date": 2002,
                    "value": 85.38760996
                },
                {
                    "date": 2002,
                    "value": 258.6304837
                },
                {
                    "date": 1999,
                    "value": 101.40771
                },
                {
                    "date": 2002,
                    "value": 319.3656086
                },
                {
                    "date": 1999,
                    "value": 48.89019215
                },
                {
                    "date": 1996,
                    "value": 185.5018042
                },
                {
                    "date": 2002,
                    "value": 44.27040391
                },
                {
                    "date": 1998,
                    "value": 163.9139191
                },
                {
                    "date": 1999,
                    "value": 64.91277185
                },
                {
                    "date": 1999,
                    "value": 214.75898
                },
                {
                    "date": 2000,
                    "value": 95.95428713
                },
                {
                    "date": 1997,
                    "value": 152.1584732
                },
                {
                    "date": 2001,
                    "value": 105.5137981
                },
                {
                    "date": 2000,
                    "value": 204.940937
                },
                {
                    "date": 2002,
                    "value": 168.8783255
                },
                {
                    "date": 1997,
                    "value": 109.6414378
                },
                {
                    "date": 1996,
                    "value": 8.294135496
                },
                {
                    "date": 1996,
                    "value": 170.1018831
                },
                {
                    "date": 2001,
                    "value": 133.4457303
                },
                {
                    "date": 1997,
                    "value": 154.7432792
                },
                {
                    "date": 2001,
                    "value": 115.9420248
                },
                {
                    "date": 1997,
                    "value": 161.6765493
                },
                {
                    "date": 2001,
                    "value": 318.3716388
                },
                {
                    "date": 2000,
                    "value": 185.0529758
                },
                {
                    "date": 1996,
                    "value": -25.0084555
                },
                {
                    "date": 1998,
                    "value": 179.3206217
                },
                {
                    "date": 2002,
                    "value": 23.77085763
                },
                {
                    "date": 1996,
                    "value": 109.5537878
                },
                {
                    "date": 2001,
                    "value": 104.5309686
                },
                {
                    "date": 1998,
                    "value": 188.4592993
                },
                {
                    "date": 1997,
                    "value": -42.71530849
                },
                {
                    "date": 1998,
                    "value": 191.2920462
                },
                {
                    "date": 1999,
                    "value": 133.7938658
                },
                {
                    "date": 1998,
                    "value": 159.0451771
                },
                {
                    "date": 2002,
                    "value": 178.4659497
                },
                {
                    "date": 1998,
                    "value": 236.824034
                },
                {
                    "date": 2001,
                    "value": 65.69920953
                },
                {
                    "date": 1997,
                    "value": 176.8594544
                },
                {
                    "date": 2002,
                    "value": 224.9232276
                },
                {
                    "date": 2001,
                    "value": 353.1720826
                },
                {
                    "date": 1996,
                    "value": -42.54134484
                },
                {
                    "date": 2002,
                    "value": 352.5103937
                },
                {
                    "date": 2002,
                    "value": 100.4976596
                },
                {
                    "date": 2001,
                    "value": 262.7544883
                },
                {
                    "date": 1998,
                    "value": 78.31221195
                },
                {
                    "date": 1996,
                    "value": 161.2249696
                },
                {
                    "date": 1998,
                    "value": 77.25946692
                },
                {
                    "date": 2002,
                    "value": 320.1315855
                },
                {
                    "date": 2000,
                    "value": 147.2817322
                },
                {
                    "date": 2002,
                    "value": 257.4599337
                },
                {
                    "date": 1997,
                    "value": 69.08830619
                },
                {
                    "date": 1998,
                    "value": 146.0831955
                },
                {
                    "date": 2002,
                    "value": 113.8032144
                },
                {
                    "date": 1999,
                    "value": 205.7691001
                },
                {
                    "date": 2001,
                    "value": 117.1322359
                },
                {
                    "date": 1997,
                    "value": 130.8596499
                },
                {
                    "date": 1996,
                    "value": 1.95131609
                },
                {
                    "date": 2001,
                    "value": 262.9490431
                },
                {
                    "date": 2001,
                    "value": 34.79418313
                },
                {
                    "date": 1997,
                    "value": 101.7745406
                },
                {
                    "date": 1999,
                    "value": 49.77164944
                },
                {
                    "date": 2001,
                    "value": 200.7904755
                },
                {
                    "date": 2002,
                    "value": 161.5282583
                },
                {
                    "date": 2001,
                    "value": 216.4782181
                },
                {
                    "date": 1996,
                    "value": -33.33688556
                },
                {
                    "date": 2001,
                    "value": 235.903581
                },
                {
                    "date": 1998,
                    "value": 77.52683993
                },
                {
                    "date": 1996,
                    "value": 109.03816
                },
                {
                    "date": 1998,
                    "value": 46.23212288
                },
                {
                    "date": 2002,
                    "value": 334.8055355
                },
                {
                    "date": 2002,
                    "value": -28.40462897
                },
                {
                    "date": 2001,
                    "value": 259.6404954
                },
                {
                    "date": 2000,
                    "value": 146.3087239
                },
                {
                    "date": 2002,
                    "value": 377.0370575
                },
                {
                    "date": 1997,
                    "value": 26.75431767
                },
                {
                    "date": 2002,
                    "value": 263.8179041
                },
                {
                    "date": 1998,
                    "value": -16.58595091
                },
                {
                    "date": 1999,
                    "value": 225.6157298
                },
                {
                    "date": 2002,
                    "value": -42.35546988
                },
                {
                    "date": 2000,
                    "value": 234.5228736
                },
                {
                    "date": 1996,
                    "value": -38.9393706
                },
                {
                    "date": 1999,
                    "value": 211.1955424
                },
                {
                    "date": 1998,
                    "value": 37.78872187
                },
                {
                    "date": 1998,
                    "value": 186.3913279
                },
                {
                    "date": 2001,
                    "value": 162.9298056
                },
                {
                    "date": 2001,
                    "value": 326.0401303
                },
                {
                    "date": 2002,
                    "value": 244.4557295
                },
                {
                    "date": 1996,
                    "value": 121.3493094
                },
                {
                    "date": 1996,
                    "value": -4.908452899
                },
                {
                    "date": 2000,
                    "value": 289.8393967
                },
                {
                    "date": 2002,
                    "value": 231.050691
                },
                {
                    "date": 2000,
                    "value": 185.6270916
                },
                {
                    "date": 2001,
                    "value": 217.0400562
                },
                {
                    "date": 2000,
                    "value": 233.1733188
                },
                {
                    "date": 1997,
                    "value": -108.585529
                },
                {
                    "date": 1997,
                    "value": 132.1325814
                },
                {
                    "date": 2000,
                    "value": 168.6266924
                },
                {
                    "date": 1997,
                    "value": 192.0853546
                },
                {
                    "date": 1998,
                    "value": 46.22287178
                },
                {
                    "date": 1999,
                    "value": 192.0663673
                },
                {
                    "date": 1997,
                    "value": -76.42243079
                },
                {
                    "date": 1996,
                    "value": -166.2188619
                },
                {
                    "date": 1997,
                    "value": 50.57489598
                },
                {
                    "date": 1997,
                    "value": 161.6687837
                },
                {
                    "date": 1996,
                    "value": 11.57283366
                },
                {
                    "date": 1996,
                    "value": 176.3964678
                },
                {
                    "date": 2002,
                    "value": 67.80298236
                },
                {
                    "date": 2002,
                    "value": 225.2487353
                },
                {
                    "date": 2002,
                    "value": 132.5723879
                },
                {
                    "date": 2000,
                    "value": 276.3019917
                },
                {
                    "date": 1999,
                    "value": 124.5530979
                },
                {
                    "date": 2001,
                    "value": 301.9152608
                },
                {
                    "date": 2002,
                    "value": 85.22160659
                },
                {
                    "date": 2002,
                    "value": 291.9140151
                },
                {
                    "date": 2002,
                    "value": 122.4231766
                },
                {
                    "date": 1997,
                    "value": 213.9817405
                },
                {
                    "date": 2000,
                    "value": 164.1858424
                },
                {
                    "date": 1996,
                    "value": 110.8755204
                },
                {
                    "date": 2001,
                    "value": -12.51757909
                },
                {
                    "date": 2002,
                    "value": 364.7130522
                },
                {
                    "date": 1997,
                    "value": 25.74815884
                },
                {
                    "date": 2002,
                    "value": 362.1798034
                },
                {
                    "date": 1997,
                    "value": 19.35952907
                },
                {
                    "date": 1999,
                    "value": 171.6071014
                },
                {
                    "date": 1999,
                    "value": 124.2586256
                },
                {
                    "date": 2000,
                    "value": 242.8487277
                },
                {
                    "date": 2001,
                    "value": 149.2189275
                },
                {
                    "date": 1997,
                    "value": 153.4503189
                },
                {
                    "date": 1997,
                    "value": 30.03059153
                },
                {
                    "date": 1997,
                    "value": 140.9275416
                },
                {
                    "date": 1996,
                    "value": -51.29477103
                },
                {
                    "date": 2000,
                    "value": 250.9379606
                },
                {
                    "date": 2002,
                    "value": 158.3533996
                },
                {
                    "date": 1998,
                    "value": 130.182317
                },
                {
                    "date": 2001,
                    "value": 138.7092058
                },
                {
                    "date": 2002,
                    "value": 253.3304494
                },
                {
                    "date": 2002,
                    "value": 144.9757234
                },
                {
                    "date": 1996,
                    "value": 178.5478547
                },
                {
                    "date": 2000,
                    "value": 72.20396078
                },
                {
                    "date": 1996,
                    "value": 553.9499109
                },
                {
                    "date": 2002,
                    "value": 219.5272559
                },
                {
                    "date": 1998,
                    "value": 135.3017077
                },
                {
                    "date": 1996,
                    "value": 2.750346155
                },
                {
                    "date": 1999,
                    "value": 164.5810382
                },
                {
                    "date": 1996,
                    "value": 29.28765195
                },
                {
                    "date": 1998,
                    "value": 171.8155041
                },
                {
                    "date": 1996,
                    "value": -62.47847974
                },
                {
                    "date": 1997,
                    "value": 151.5809857
                },
                {
                    "date": 2002,
                    "value": 134.6323019
                },
                {
                    "date": 1999,
                    "value": 212.9892487
                },
                {
                    "date": 2002,
                    "value": 89.75102376
                },
                {
                    "date": 2000,
                    "value": 283.2522823
                },
                {
                    "date": 1999,
                    "value": 89.39028149
                },
                {
                    "date": 2001,
                    "value": 278.4404473
                },
                {
                    "date": 1996,
                    "value": -109.3304066
                },
                {
                    "date": 1999,
                    "value": 229.1511074
                },
                {
                    "date": 1999,
                    "value": 62.34497978
                },
                {
                    "date": 2000,
                    "value": 85.230187
                },
                {
                    "date": 1999,
                    "value": 100.4950058
                },
                {
                    "date": 1997,
                    "value": 200.2309017
                },
                {
                    "date": 1999,
                    "value": 76.72850604
                },
                {
                    "date": 2000,
                    "value": 229.9301867
                },
                {
                    "date": 1998,
                    "value": 72.15344724
                },
                {
                    "date": 1998,
                    "value": 195.0161825
                },
                {
                    "date": 1999,
                    "value": 94.87059541
                },
                {
                    "date": 1997,
                    "value": 157.0910643
                },
                {
                    "date": 2001,
                    "value": 65.01399632
                },
                {
                    "date": 2001,
                    "value": 297.1591558
                },
                {
                    "date": 1998,
                    "value": 20.07084747
                },
                {
                    "date": 1999,
                    "value": 233.4660872
                },
                {
                    "date": 2001,
                    "value": 216.3095206
                },
                {
                    "date": 1997,
                    "value": 170.52204
                },
                {
                    "date": 1999,
                    "value": 78.50367791
                },
                {
                    "date": 2000,
                    "value": 239.9552241
                },
                {
                    "date": 1997,
                    "value": 2.147629172
                },
                {
                    "date": 2002,
                    "value": 379.3151119
                },
                {
                    "date": 1998,
                    "value": 51.57920743
                },
                {
                    "date": 2000,
                    "value": 261.4090462
                },
                {
                    "date": 1998,
                    "value": 43.44942227
                },
                {
                    "date": 1997,
                    "value": 132.7226702
                },
                {
                    "date": 2000,
                    "value": 175.8934445
                },
                {
                    "date": 2000,
                    "value": 277.2232739
                },
                {
                    "date": 2002,
                    "value": 184.9889427
                },
                {
                    "date": 1996,
                    "value": 120.8580358
                },
                {
                    "date": 1997,
                    "value": 191.6720426
                },
                {
                    "date": 2001,
                    "value": 187.6245982
                },
                {
                    "date": 2002,
                    "value": 179.1492148
                },
                {
                    "date": 1999,
                    "value": 157.2360451
                },
                {
                    "date": 2001,
                    "value": 80.04527985
                },
                {
                    "date": 1997,
                    "value": 212.3687904
                },
                {
                    "date": 1998,
                    "value": 24.00284469
                },
                {
                    "date": 1996,
                    "value": 114.4805217
                },
                {
                    "date": 1997,
                    "value": -4.064305421
                },
                {
                    "date": 1997,
                    "value": 226.8353268
                },
                {
                    "date": 2002,
                    "value": 227.1109639
                },
                {
                    "date": 2000,
                    "value": 279.0223834
                },
                {
                    "date": 1996,
                    "value": 21.41081879
                },
                {
                    "date": 1997,
                    "value": 143.8646094
                },
                {
                    "date": 2001,
                    "value": 158.1113357
                },
                {
                    "date": 1998,
                    "value": 184.2694171
                },
                {
                    "date": 1998,
                    "value": 59.4411768
                },
                {
                    "date": 1996,
                    "value": 150.9424472
                },
                {
                    "date": 2002,
                    "value": 227.4581954
                },
                {
                    "date": 2001,
                    "value": 293.3287564
                },
                {
                    "date": 2000,
                    "value": 155.2869436
                },
                {
                    "date": 1996,
                    "value": 181.2817844
                },
                {
                    "date": 1999,
                    "value": 118.3508146
                },
                {
                    "date": 2002,
                    "value": 290.9272223
                },
                {
                    "date": 1998,
                    "value": -25.95669287
                },
                {
                    "date": 2000,
                    "value": 261.577609
                },
                {
                    "date": 2001,
                    "value": 137.9238059
                },
                {
                    "date": 1996,
                    "value": 104.2415804
                },
                {
                    "date": 2001,
                    "value": 110.8406592
                },
                {
                    "date": 1998,
                    "value": 214.1830759
                },
                {
                    "date": 2000,
                    "value": 182.1599734
                },
                {
                    "date": 1997,
                    "value": -80.82039329
                },
                {
                    "date": 1999,
                    "value": 80.93972737
                },
                {
                    "date": 2000,
                    "value": 233.3097023
                },
                {
                    "date": 1996,
                    "value": -148.9825013
                },
                {
                    "date": 1996,
                    "value": 102.8203318
                },
                {
                    "date": 1996,
                    "value": 17.94859818
                },
                {
                    "date": 2000,
                    "value": 232.4654949
                },
                {
                    "date": 1999,
                    "value": 127.3053161
                },
                {
                    "date": 1998,
                    "value": 189.5161067
                },
                {
                    "date": 1997,
                    "value": 52.03000927
                },
                {
                    "date": 2000,
                    "value": 266.2037164
                },
                {
                    "date": 2001,
                    "value": 19.61896068
                },
                {
                    "date": 2002,
                    "value": 310.2054732
                },
                {
                    "date": 1998,
                    "value": 95.51888317
                },
                {
                    "date": 2002,
                    "value": 565.7785986
                },
                {
                    "date": 1997,
                    "value": 49.75458286
                },
                {
                    "date": 1997,
                    "value": 165.5522385
                },
                {
                    "date": 1997,
                    "value": 46.2049385
                },
                {
                    "date": 1998,
                    "value": 178.0625039
                },
                {
                    "date": 1996,
                    "value": 17.27953926
                },
                {
                    "date": 1997,
                    "value": 261.8950031
                },
                {
                    "date": 2001,
                    "value": 143.8183958
                },
                {
                    "date": 2000,
                    "value": 250.1691319
                },
                {
                    "date": 1996,
                    "value": 25.95785178
                },
                {
                    "date": 2000,
                    "value": 179.6837376
                },
                {
                    "date": 1996,
                    "value": -43.26549148
                },
                {
                    "date": 1998,
                    "value": 151.4800229
                },
                {
                    "date": 1996,
                    "value": -111.4736412
                },
                {
                    "date": 2001,
                    "value": 233.9101271
                },
                {
                    "date": 2001,
                    "value": 164.7412837
                },
                {
                    "date": 1996,
                    "value": 208.0000028
                },
                {
                    "date": 1996,
                    "value": 20.66494709
                },
                {
                    "date": 1997,
                    "value": 235.1549474
                },
                {
                    "date": 1998,
                    "value": 35.52670759
                },
                {
                    "date": 2000,
                    "value": 228.8558584
                },
                {
                    "date": 1999,
                    "value": 67.91927028
                },
                {
                    "date": 1996,
                    "value": 514.1211521
                },
                {
                    "date": 2002,
                    "value": 137.5345718
                },
                {
                    "date": 1997,
                    "value": 137.2434424
                },
                {
                    "date": 1998,
                    "value": 18.38698421
                },
                {
                    "date": 2001,
                    "value": 188.2074573
                },
                {
                    "date": 1998,
                    "value": -27.98708345
                },
                {
                    "date": 1996,
                    "value": 196.0813888
                },
                {
                    "date": 2000,
                    "value": 156.5011947
                },
                {
                    "date": 1999,
                    "value": 164.2303054
                },
                {
                    "date": 2001,
                    "value": 155.72949
                },
                {
                    "date": 1996,
                    "value": 188.3434843
                },
                {
                    "date": 2001,
                    "value": 172.8608446
                },
                {
                    "date": 1996,
                    "value": 108.7538702
                },
                {
                    "date": 2002,
                    "value": 158.4953604
                },
                {
                    "date": 1997,
                    "value": 295.1204317
                },
                {
                    "date": 2000,
                    "value": 202.7568375
                },
                {
                    "date": 1999,
                    "value": 192.4999169
                },
                {
                    "date": 1998,
                    "value": 70.87167826
                },
                {
                    "date": 2002,
                    "value": 434.4384007
                },
                {
                    "date": 2002,
                    "value": 14.89312532
                },
                {
                    "date": 2000,
                    "value": 282.049065
                },
                {
                    "date": 1997,
                    "value": 33.9431407
                },
                {
                    "date": 1999,
                    "value": 226.8977153
                },
                {
                    "date": 1997,
                    "value": 26.20327452
                },
                {
                    "date": 1996,
                    "value": 118.5680419
                },
                {
                    "date": 2002,
                    "value": 116.6038789
                },
                {
                    "date": 2002,
                    "value": 701.1076239
                },
                {
                    "date": 1998,
                    "value": 18.20232892
                },
                {
                    "date": 1996,
                    "value": 97.88270558
                },
                {
                    "date": 1997,
                    "value": -57.92522621
                },
                {
                    "date": 2000,
                    "value": 255.764516
                },
                {
                    "date": 2000,
                    "value": 54.52055825
                },
                {
                    "date": 1999,
                    "value": 206.9950256
                },
                {
                    "date": 2002,
                    "value": 222.5568434
                },
                {
                    "date": 1999,
                    "value": 209.7686251
                },
                {
                    "date": 1996,
                    "value": 10.84328606
                },
                {
                    "date": 1998,
                    "value": 170.9119633
                },
                {
                    "date": 2001,
                    "value": 178.7836109
                },
                {
                    "date": 2001,
                    "value": 404.1838318
                },
                {
                    "date": 2000,
                    "value": 75.59836591
                },
                {
                    "date": 2002,
                    "value": 335.7867388
                },
                {
                    "date": 2000,
                    "value": 188.021937
                },
                {
                    "date": 1998,
                    "value": 35.05881498
                },
                {
                    "date": 1997,
                    "value": 60.93804001
                },
                {
                    "date": 1996,
                    "value": 105.3636852
                },
                {
                    "date": 1998,
                    "value": 45.08619354
                },
                {
                    "date": 1999,
                    "value": 182.6039742
                },
                {
                    "date": 1998,
                    "value": 41.82386356
                },
                {
                    "date": 1996,
                    "value": 126.2237861
                },
                {
                    "date": 2000,
                    "value": 106.6725667
                },
                {
                    "date": 1996,
                    "value": 167.2021452
                },
                {
                    "date": 2002,
                    "value": 88.59645944
                },
                {
                    "date": 2002,
                    "value": 334.4911434
                },
                {
                    "date": 1998,
                    "value": 124.9516826
                },
                {
                    "date": 2002,
                    "value": 308.8227928
                },
                {
                    "date": 2001,
                    "value": 98.87445255
                },
                {
                    "date": 1998,
                    "value": 127.9427486
                },
                {
                    "date": 2002,
                    "value": 139.3041594
                },
                {
                    "date": 1997,
                    "value": 144.5111193
                },
                {
                    "date": 1998,
                    "value": 146.7772939
                },
                {
                    "date": 1996,
                    "value": 111.0311866
                },
                {
                    "date": 2000,
                    "value": 143.0060368
                },
                {
                    "date": 1997,
                    "value": 266.3802546
                },
                {
                    "date": 1996,
                    "value": -56.52883643
                },
                {
                    "date": 1997,
                    "value": 165.2809079
                },
                {
                    "date": 1999,
                    "value": 76.76795913
                },
                {
                    "date": 2002,
                    "value": 357.0434218
                },
                {
                    "date": 2000,
                    "value": 39.42975856
                },
                {
                    "date": 2001,
                    "value": 200.3437131
                },
                {
                    "date": 1996,
                    "value": -7.375059038
                },
                {
                    "date": 2002,
                    "value": 402.6828173
                },
                {
                    "date": 1999,
                    "value": 138.1697845
                },
                {
                    "date": 1997,
                    "value": 133.987686
                },
                {
                    "date": 1999,
                    "value": 133.9946493
                },
                {
                    "date": 2001,
                    "value": 419.2625726
                },
                {
                    "date": 1996,
                    "value": -54.20342289
                },
                {
                    "date": 1997,
                    "value": 177.5902054
                },
                {
                    "date": 1996,
                    "value": -5.268905046
                },
                {
                    "date": 1996,
                    "value": 110.6727969
                },
                {
                    "date": 2001,
                    "value": 76.98892296
                },
                {
                    "date": 2000,
                    "value": 220.6703596
                },
                {
                    "date": 2000,
                    "value": 84.80589751
                },
                {
                    "date": 2002,
                    "value": -133.7878417
                },
                {
                    "date": 2001,
                    "value": 159.1013487
                },
                {
                    "date": 1996,
                    "value": 101.4781021
                },
                {
                    "date": 2002,
                    "value": 221.1297277
                },
                {
                    "date": 1997,
                    "value": 160.6555138
                },
                {
                    "date": 1999,
                    "value": 100.9936022
                },
                {
                    "date": 1997,
                    "value": 126.2748973
                },
                {
                    "date": 2000,
                    "value": 66.52701701
                },
                {
                    "date": 1996,
                    "value": 110.6464315
                },
                {
                    "date": 2002,
                    "value": 36.15946532
                },
                {
                    "date": 1999,
                    "value": 226.3014108
                },
                {
                    "date": 1997,
                    "value": 21.72055667
                },
                {
                    "date": 2000,
                    "value": 167.935579
                },
                {
                    "date": 1998,
                    "value": 20.81132199
                },
                {
                    "date": 1999,
                    "value": 227.8543829
                },
                {
                    "date": 1996,
                    "value": 25.76979155
                },
                {
                    "date": 1997,
                    "value": 244.1586111
                },
                {
                    "date": 2000,
                    "value": 177.1136973
                },
                {
                    "date": 1999,
                    "value": 221.050831
                },
                {
                    "date": 1999,
                    "value": 110.4931264
                },
                {
                    "date": 2000,
                    "value": 223.5116122
                },
                {
                    "date": 1999,
                    "value": 122.060817
                },
                {
                    "date": 1997,
                    "value": 148.775981
                },
                {
                    "date": 2001,
                    "value": 135.7563109
                },
                {
                    "date": 1997,
                    "value": 208.8947212
                },
                {
                    "date": 2001,
                    "value": 131.5311888
                },
                {
                    "date": 1998,
                    "value": 179.4150518
                },
                {
                    "date": 1997,
                    "value": 27.32787774
                },
                {
                    "date": 1997,
                    "value": 231.3493247
                },
                {
                    "date": 1997,
                    "value": 37.53502314
                },
                {
                    "date": 1996,
                    "value": 118.1465839
                },
                {
                    "date": 2000,
                    "value": 31.11532162
                },
                {
                    "date": 2002,
                    "value": 267.8910308
                },
                {
                    "date": 2001,
                    "value": 102.2021658
                },
                {
                    "date": 1997,
                    "value": 193.4957639
                },
                {
                    "date": 1999,
                    "value": 63.44883985
                },
                {
                    "date": 2000,
                    "value": 261.3125672
                },
                {
                    "date": 2000,
                    "value": 33.74883377
                },
                {
                    "date": 1999,
                    "value": 195.3846233
                },
                {
                    "date": 2001,
                    "value": 83.74423595
                },
                {
                    "date": 2002,
                    "value": 484.2443322
                },
                {
                    "date": 1996,
                    "value": -38.29618771
                },
                {
                    "date": 1997,
                    "value": 147.840383
                },
                {
                    "date": 1996,
                    "value": 1.485343235
                },
                {
                    "date": 1998,
                    "value": 165.556157
                },
                {
                    "date": 1999,
                    "value": 144.0741205
                },
                {
                    "date": 2001,
                    "value": 403.9901334
                },
                {
                    "date": 1996,
                    "value": 2.132530501
                },
                {
                    "date": 2001,
                    "value": 350.3402704
                },
                {
                    "date": 1997,
                    "value": -25.94177964
                },
                {
                    "date": 2000,
                    "value": 240.3780517
                },
                {
                    "date": 1998,
                    "value": 41.14205171
                },
                {
                    "date": 2002,
                    "value": 35.363135
                },
                {
                    "date": 2002,
                    "value": 113.1600897
                },
                {
                    "date": 2000,
                    "value": 168.8637489
                },
                {
                    "date": 1996,
                    "value": -25.96838117
                },
                {
                    "date": 1997,
                    "value": 125.7448262
                },
                {
                    "date": 1996,
                    "value": -133.4504018
                },
                {
                    "date": 1999,
                    "value": 165.2567402
                },
                {
                    "date": 1997,
                    "value": 39.80787742
                }
            ];

            /** Clear down existing plot */
            this.container.selectAll('*').remove();
            
            /** Size our initial container to match the viewport */
            this.container.attr({
                width: `${options.viewport.width}`,
                height: `${options.viewport.height}`,
            });

            /** Simple view model - for now we'll just group by year from static data and then add values */
            let simpleViewModel = d3.nest<IStaticData>()
                .key((d) => {
                    return d.date.toString()
                })
                .rollup(function(v) {
                    let dataPoints = d3.entries(v).map((d) => {
                        return d.value.value;
                    }).sort(d3.ascending);
                    return {
                        min: d3.min(v, (d) => {
                            return d.value
                        }),
                        max: d3.max(v, (d) => {
                            return d.value
                        }),
                        mean: d3.mean(v, (d) => {
                            return d.value
                        }),
                        median: d3.median(v, (d) => {
                            return d.value
                        }),
                        quartile1: d3.quantile(dataPoints, 0.25),
                        quartile3: d3.quantile(dataPoints, 0.75),
                        dataPoints: dataPoints
                    }
                })
                .sortKeys(d3.ascending)
                .entries(staticData);
            console.log(simpleViewModel);

            /** Set y-axis domain - TODO: See if we can map this out when we process the data the first time */
            let yMin = d3.min(staticData, (d) => {
                    return d.value;
                }),
                yMax = d3.max(staticData, (d) => {
                    return d.value;
                });

            if (debug) {
                console.log('|\tY-Domain', yMin, yMax);
            }

            /** Create a Y axis */
            
                /** Placeholder metadata column and format strings */
                let formatStringProp: powerbi.DataViewObjectPropertyIdentifier = {
                    objectName: 'general',
                    propertyName: 'formatString',
                };
                let metaDataColumnFormatted: powerbi.DataViewMetadataColumn = {
                    displayName: 'Column',
                    type: ValueType.fromDescriptor({ numeric: true }),
                    objects: {
                        general: {
                            formatString: '#,##0',
                        }
                    }
                };

                let yAxisWidth = 50;
                let xAxisHeight = 30;

                let yAxis = axisHelper.createAxis({
                    pixelSpan: options.viewport.height - xAxisHeight,
                    dataDomain: [yMin, yMax],
                    metaDataColumn: metaDataColumnFormatted,
                    formatString: valueFormatter.getFormatString(metaDataColumnFormatted, formatStringProp),
                    outerPadding: 10, /** TODO: Probably font size-based to keep things nice */
                    isScalar: true,
                    isVertical: true,
                });

                let yAxisContainer = this.container
                    .append('g')
                        .classed('yAxisContainer', true)
                        .style({
                            'stroke-width' : 1 /** TODO: Config */
                        });

                yAxis.axis.orient('left');
                yAxis.axis.tickSize(-options.viewport.width + yAxisWidth);
                
                let yAxisTicks = yAxisContainer
                    .append('g')
                        .classed({
                            'yAxis': true,
                            'grid': true
                        })
                        .attr('transform', `translate(${yAxisWidth},0)`)
                    .call(yAxis.axis);

                
                 /** Apply gridline styling */
                 yAxisTicks.selectAll('line')
                    .attr({
                        stroke: '#EAEAEA',
                        'stroke-width': 1
                    });

                console.log(yAxis);

            /** Create an X-axis */
                let xScale = d3.scale.ordinal()
                    .domain(simpleViewModel.map(d => d.key))
                    .rangeRoundBands([0, options.viewport.width - yAxisWidth])

                let xAxis = d3.svg.axis()
                    .scale(xScale)
                    .orient('bottom')
                
                let xAxisContainer = this.container
                    .append('g')
                    .classed('xAxisContainer', true)
                        .style({
                            'stroke-width' : 1 /** TODO: Config */
                        });
                
                let xAxisTicks = xAxisContainer
                    .append('g')
                        .classed({
                            'xAxis': true,
                            'grid': true
                        })
                        .attr('transform', `translate(${yAxisWidth}, ${options.viewport.height - xAxisHeight})`)
                    .call(xAxis);

            /** Success! */
            if (debug) {
                console.log('|\tVisual fully rendered!');
                console.log('====================');
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
            let debug = this.settings.about.debugMode && this.settings.about.debugProperties;
            if (debug) {
                console.log('\n====================');
                console.log(`Properties Update: ${objectName}`);
                console.log('====================');
            }

            /** TODO: instances */

            /** Output all transformed instance info if we're debugging */
            if (debug) {
                instances.map(function (instance) {
                    console.log(`|\t${instance.objectName}`, instance);
                });
                console.log('|\tProperties fully processed!');
                console.log('====================');
            }

            return instances;
        }
    }
}