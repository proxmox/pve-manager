Ext.define('PVE.form.HotplugFeatureSelector', {
    extend: 'Ext.form.CheckboxGroup',
    alias: 'widget.pveHotplugFeatureSelector',

    columns: 1,
    vertical: true,
    items: [
	{ boxLabel: gettext('Disk'),    name: 'hotplug', inputValue: 'disk',   submitValue: false, checked: true },
	{ boxLabel: gettext('Network'), name: 'hotplug', inputValue: 'network',submitValue: false, checked: true },
	{ boxLabel: 'USB',              name: 'hotplug', inputValue: 'usb',    submitValue: false, checked: true },
	{ boxLabel: gettext('Memory'),  name: 'hotplug', inputValue: 'memory', submitValue: false },
	{ boxLabel: gettext('CPU'),     name: 'hotplug', inputValue: 'cpu',    submitValue: false }
    ],

    setValue: function(value) {
	var me = this;
	var newVal = [];
	if (value === '1') {
	    newVal = ['disk', 'network', 'usb'];
	} else if (value !== '0') {
	    newVal = value.split(',');
	}
	me.callParent([{ hotplug: newVal }]);
    },

    // overide framework function to
    // assemble the hotplug value
    getSubmitData: function() {
	var me = this,
	boxes = me.getBoxes(),
	data = [];
	Ext.Array.forEach(boxes, function(box){
	    if (box.getValue()) {
		data.push(box.inputValue);
	    }
	});

	/* because above is hotplug an array */
	/*jslint confusion: true*/
	if (data.length === 0) {
	    return { 'hotplug':'0' };
	} else {
	    return { 'hotplug': data.join(',') };
	}
    }

});
