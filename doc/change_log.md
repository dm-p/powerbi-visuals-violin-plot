# Change Log

---

[Home](../readme.md) | [Usage and Visual Properties](./usage.md) | **Change Log** | [Privacy Policy](./privacy_policy.md) | [Support](./support.md)

---

## 1.4.0

🚧 **Currently under development** 🚧 - the anticipated list of features is as follows:

### New Features & Enhancements

-   **Data Fetching Options** property menu (long dormant in the visual code and waiting for a stable [Power BI API](https://docs.microsoft.com/en-us/power-bi/developer/visuals/fetch-more-data?WT.mc_id=DP-MVP-5003712)) has been enabled and optimised.

    -   If enabled, the Violin Plot will request Power BI to incrementally fetch additional data from the query result and add to the dataset.
    -   Power BI will supply approximately 30K additional rows per fetch until it has determined that either all rows have been fetched, or it cannot safely supply any more rows.
    -   If Power BI opts to not supply any more rows, your dataset may still not contain all data from your query. If this is the case, then a warning message will be present in the visual header and inform how many rows have been loaded.
    -   For more information, refer to the [Additional Data Fetching](./usage.md#additional-data-fetching) section in the [Usage](./usage.md) page, or the [Fetch More Data API](https://docs.microsoft.com/en-us/power-bi/developer/visuals/fetch-more-data?WT.mc_id=DP-MVP-5003712) in the Power BI visuals documentation.

-   The display name of the column added to the _Category_ data role is now supplied in the tooltip, instead of `Category`. This means that you are able to customise the text of this item by renaming the field in the fields pane, like you would for any other visual (#8; formerly [#97](https://bitbucket.org/dm-p/power-bi-visuals-violin-plot/issues/97/default-tooltip) in the old repository).

-   Colors of the data points that can be colored (e.g. median, mean) will correspond to those settings in the default tooltip; opacity of the computed statistics have been set to fully transparent (#12; fix for [#87](https://bitbucket.org/dm-p/power-bi-visuals-violin-plot/issues/87/dot-color-in-tooltip-for-barcode-plot) in the old repository)

### Bugs Fixed

-   The **'# Samples'** tooltip was not honoring the specified properties and would use the same formatting as the supplied measure.

    -   This would cause issues if the measure had special formatting, e.g. currency.
    -   The tooltip has been re-written to honour the **# Samples Display Units** and **# Samples Decimal Places** properties in the **Default Tooltip Details** property menu.
    -   These changes have also been applied to the **# Samples with Highlighte Value** tooltip item if using the barcode/strip combo plot.

### Housekeeping

-   The visual was written on the previous version of the visuals SDK, so has undergone a number of changes to its architecture to get it onto the latest tooling and eligible for (re) certification when submitted to AppSource.

## 1.3.0.4

A detailed write-up of the changes below [is published here](https://coacervo.co/violin_130).

### New Features & Enhancements

#### Revised Legend

The _Legend_ property menu has some more options:

-   Category icon shape has been modified to be more violin-y.
-   Category icons can be enabled or disabled by setting the _Show Categories_ property as appropriate.
-   The _Show Statistical Indicators_ property allows you to toggle the display of enabled combo plot indicators, such as mean, meadian and quartiles (depending on the combo plot configuration).
-   If displaying quartiles on the comb plot and have the same formatting, the indicators will consolidate to a single legend item; conversely, if the formatting on each quartile is different then you will get a specific indicator for each quartile.
-   Display text for each statistical indicator can be modified by setting the appropriate property.

#### Column (Min/Max) Combo Plot

An additional combo plot is available, which plots a column spanning min to max in each category. This is similar in behaviour to a [range column chart](https://www.anychart.com/chartopedia/chart-type/range-column-chart/).

-   This is available in the _Combo Plot_ property menu, by selecting _Column (Min/Max)_ from the _Plot Type_ property.
-   Statistical indicators available for addition to the plot are mean, median and quartiles.

#### KDE Plot Clamping

If you're not a fan of the KDE plot run-off that the violin produces, you can opt to restrict the plot to stay to the confines of the minimum and maximum values in each category.

-   To apply this setting, select _Clamp to Min/Max_ from the _Violin Options_ property menu.
-   With this enabled, the plot will abruptly stop at the min and max values, but the distribution will remain as if the plot were to continue as it did previously, which does its best to still communicate the distribution of your data.
-   Please bear in mind that while this may be desirable for your particular use case, sharply cutting the KDE plot when it cannot hit these confines naturally may hide insights about the modality (shape) of your data. As such, it is disabled by default.

#### Y-Axis Start and End

To bring the visual in-line with the behaviour of other cartesian charts, the _Y-Axis_ property menu now allows you to specify _Start_ and _End_ values for your chart.

Behaviour against the KDE plot portion works very much like clamping, detailed above - if your KDE plot exceeds either boundary, the KDE plot will be truncated in a similar way but will show what the distribution looked like based on the entire set.

#### \# Samples with Highlighted Value

If using the barcode combo plot option, you might have a large data set with a very low number of distinct values. In these cases, the combo plot does not communicate this well, due to the nature of its design (although the KDE plot will show this). To better help identify the data behind each bar, the default tooltip now contains a _\# Samples with Highlighted Value_ item on the tooltip.

#### Violin Stroke Width

The _Stroke Width_ property in the _Violin Options_ menu can now be set to _0_, which means that the KDE plot line can be hidden if you just ant to work with the specified fill colour and transparency settings for each category.

### Known Issues

-   Violin Sides Don't Always Overlap Correctly (#27)

## 1.2.0.3

A detailed write-up of the changes below [is published here](https://medium.com/dm-p/violin-120-c726bea99c2b).

### New Features & Enhancements

#### Improved Tooltip Support

Power BI Desktop (March 2019) [introduced improved tooltip formatting options](https://powerbi.microsoft.com/en-us/blog/power-bi-desktop-march-2019-feature-summary/#tooltipFormatting). We recently saw the [introduction of report page tooltips as well](https://docs.microsoft.com/en-us/power-bi/desktop-tooltips). Changes have been applied to the visual to support these features and make tooltip formatting consistent with core visuals. **This has resulted in some minor changes for the end user**:

-   The _Tooltip_ menu now contains all core tooltip formatting options (i.e. it's the standard Power BI _Tooltip_ menu that you see in the core visuals).
-   The properties menu that allows customisation of the tooltip data points in the default tooltip has been renamed to _Default Tooltip Details_.
-   This is the same menu under the hood, so your configuration for any visuals will be retained when the new version of the visual is applied.

#### Culture Awareness for Measures

The visual was previously coded to only support the `en-US` locale, meaning that if you had applied locale-specific measures to your visuals then this would not be handled as intended. This has now been relaxed, and the following changes should be observed:

-   If you have applied formatting to your measure in the data model, the Y-Axis and default tooltip values will reflect this.
-   You may want to format the default tooltip measures differently to your Y-axis (e.g. show whole numbers on the axis but decimal values in the tooltip), so additional formatting options have been applied to the _Default Tooltip Details_ menu:
    -   _#Samples_ Display Units and Decimal Places
    -   _Measure_ Display Units and Decimal Places

Note that this does not enable locale-specific translations for the visual, just for the displayed measure values.

#### _Show Data_ Hotkey Support

Support for the _Show Data_ hotkey (Alt Shift + F11) has been added in.

### Bugs Fixed

-   Visual treats zero as blank/null leading to totally wrong results (#67)
-   Hover text does not format mean and standard deviation (#62)

### Known Issues

-   Violin Sides Don't Always Overlap Correctly (#27)

---

## 1.1.0.2

This release focuses on some incremental improvements to KDE bandwidth and combo plot functionality, as well as a number of Bugs Fixed. A detailed write-up of the changes below [is published here](https://medium.com/dm-p/whats-coming-in-violin-plot-1-1-0-236f3d12a8e0).

### New Features & Enhancements

#### Barcode Plot Functionality

This displays your individual data points as a combo plot in the visual, and is an alternative to the box plot.

-   The box plot will remain the default combo plot for the visual to ensure continuity for existing users. This results in some additional changes ot the visual properties to support (details below).
-   _Box Plot_ menu renamed to _Combo Plot_
-   Added _Plot Type_ property to _Combo Plot_ menu, with following options:
    -   Box (default)
    -   Barcode
-   _Median Stroke Width_ and _Mean Stroke Width_ properties added, which allows independent control of median line from the box plot stroke width where applicable
-   _Median Line Style_ property added, which allows styling of the median line in the combo plot where applicable
-   The Barcode plot has additional properties to _Show 1st and 3rd Quartiles_ as lines on the combo plot.
-   If enabled, you will have the following properties for each quartile line:
    -   Line Color
    -   Stroke Width
    -   Line Style
-   Moving the mouse over the barcode plot will highlight the nearest data point and add its value to the tooltip (if enabled)

#### Bandwidth By Category

KDE Bandwidth can now be applied by category.

-   Previously, KDE bandwidth (whether estimated or specified) was applied with the same value over all categories. This remains the default option.
-   If a _Category_ field is present, a _Bandwidth By Category_ option will be available in the _Violin Options_ menu
-   If _Specify Bandwidth_ is **disabled**, enabling this option will apply the rule-of-thumb bandwidth to each category individually
-   If _Specify Bandwidth_ is **enabled**, enabling this option will provide you with a box per category, and specifying a value will apply this to the individual category
-   You can verify the individual category values by enabling the _KDE Bandwidth_ option in the _Tooltip_ menu

### Bugs Fixed

-   Mean Circle Settings Mislabelled as Median (#51)
-   Removing Category with Legend Enabled Still Renders Legend (#49)
-   Category Doesn't Format Correctly (#59)
-   Debug Toggle Visible in About Menu (#60)

### Known Issues

-   Visual treats zero as blank/null leading to totally wrong results (#67)
-   Hover text does not format mean and standard deviation (#62)
-   Violin Sides Don't Always Overlap Correctly (#27)
-   Tooltip Won't Display if Converted from Visual with Disabled Tooltip (Having been Previously Displayed) (#41)

---

## 1.0.0.1

Initial release of the visual.

### Known Issues

-   Removing Category with Legend Enabled Still Renders Legend (#49)
-   Mean Circle Settings Mislabelled as Median (#51)
-   Violin Sides Don't Always Overlap Correctly (#27)
-   Tooltip Won't Display if Converted from Visual with Disabled Tooltip (Having been Previously Displayed) (#41)
-   Category Doesn't Format Correctly (#59)
-   Debug Toggle Visible in About Menu (#60)
