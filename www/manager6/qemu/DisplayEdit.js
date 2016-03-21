Ext.define('PVE.qemu.DisplayEdit', {
    extend: 'PVE.window.Edit',

    vmconfig: undefined,

    initComponent : function() {
	var me = this;

	var displayField;

	var validateDisplay = function() {
	    /*jslint confusion: true */
	    var val = displayField.getValue();

	    if (me.vmconfig && val.match(/^serial\d+$/)) {
		if (me.vmconfig[val] && me.vmconfig[val] === 'socket') {
		    return true;
		}
		return "Serial interface '" + val + "' is not correctly configured.";
	    }
	    
	    return true;
	};

	displayField = Ext.createWidget('DisplaySelector', {  
	    name: 'vga',
	    value: '__default__',
	    fieldLabel: gettext('Graphic card'),
	    validator: validateDisplay
	});

	Ext.apply(me, {
	    subject: gettext('Display'),
	    width: 350,
	    items: displayField
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		var values = response.result.data;

		me.vmconfig = values;

		me.setValues(values);
	    }
	});
    }
});
