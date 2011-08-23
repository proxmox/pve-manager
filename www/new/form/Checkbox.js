Ext.define('PVE.form.Checkbox', {
    extend: 'Ext.form.field.Checkbox',
    alias: ['widget.pvecheckbox'],

    inputValue: '1',

    // also accept integer 1 as true
    setRawValue: function(value) {
	var me = this;

	if (value === 1)
	    value = true;

        me.callParent([value]);
    }
});