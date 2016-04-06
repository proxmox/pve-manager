Ext.define('PVE.form.Checkbox', {
    extend: 'Ext.form.field.Checkbox',
    alias: ['widget.pvecheckbox'],

    defaultValue: undefined,

    deleteDefaultValue: false,
    deleteEmpty: false,
 
    inputValue: '1',

    getSubmitData: function() {
        var me = this,
            data = null,
            val;
        if (!me.disabled && me.submitValue) {
            val = me.getSubmitValue();
            if (val !== null) {
                data = {};
		if ((val == me.defaultValue) && me.deleteDefaultValue) {
		    data['delete'] = me.getName();
		} else {
                    data[me.getName()] = val;
		}
            } else if (me.deleteEmpty) {
               data = {};
               data['delete'] = me.getName();
	    }
        }
        return data;
    },

    // also accept integer 1 as true
    setRawValue: function(value) {
	var me = this;

	if (value === 1) {
            me.callParent([true]);
	} else {
            me.callParent([value]);
	}
    }

});