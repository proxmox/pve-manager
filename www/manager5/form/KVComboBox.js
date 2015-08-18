/* Key-Value ComboBox
 *
 * config properties:
 * comboItems: an array of Key - Value pairs
 */
Ext.define('PVE.form.KVComboBox', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveKVComboBox',

    deleteEmpty: true,
    config: {
        comboItems: undefined
    },

    getSubmitData: function() {
        var me = this,
            data = null,
            val;
        if (!me.disabled && me.submitValue) {
            val = me.getSubmitValue();
            if (val !== null && val !== '') {
                data = {};
                data[me.getName()] = val;
            } else if (me.deleteEmpty) {
		data = {};
                data['delete'] = me.getName();
	    }
        }
        return data;
    },

    initComponent: function() {
	var me = this;

	me.store = Ext.create('Ext.data.ArrayStore', {
	    model: 'KeyValue',
	    data : me.getConfig('comboItems'),
	});

	if (me.initialConfig.editable === undefined) {
	    me.editable = false;
	}

	Ext.apply(me, {
	    displayField: 'value',
	    valueField: 'key',
	    queryMode: 'local'
	});

	me.callParent();
    }
});
