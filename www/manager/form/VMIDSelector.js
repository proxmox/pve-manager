Ext.define('PVE.form.VMIDSelector', {
    extend: 'Ext.form.field.Number',
    alias: 'widget.pveVMIDSelector',
  
    minValue: 100,

    maxValue: 999999999,

    validateExists: undefined,

    validator: function(value) {
        var me = this;

	if (!Ext.isDefined(me.validateExists)) {
	    return true;
	}
	if (PVE.data.ResourceStore.findVMID(value)) {
	    if (me.validateExists === true) {
		return true;
	    }
	    return "This VM ID is already in use.";
	} else {
	    if (me.validateExists === false) {
		return true;
	    }
	    return "This VM ID does not exists.";
	}
    },

    initComponent: function() {
        var me = this;

	Ext.applyIf(me, {
	    fieldLabel: 'VM ID',
	    allowBlank: false
	});

        me.callParent();
    }
});
