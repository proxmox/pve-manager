Ext.define('PVE.panel.StatusView', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveStatusView',

    layout: {
	type: 'column'
    },

    title: gettext('Status'),

    getRecordValue: function(key, store) {
	if (!key) {
	    throw "no key given";
	}
	var me = this;

	if (store === undefined) {
	    store = me.getStore();
	}

	var rec = store.getById(key);
	if (rec) {
	    return rec.data.value;
	}

	return '';
    },

    fieldRenderer: function(val,max) {
	if (max === undefined) {
	    return val;
	}

	if (!Ext.isNumeric(max) || max === 1) {
	    return PVE.Utils.render_usage(val);
	}
	return PVE.Utils.render_size_usage(val,max);
    },

    fieldCalculator: function(used, max) {
	if (!Ext.isNumeric(max) && Ext.isNumeric(used)) {
	    return used;
	} else if(!Ext.isNumeric(used)) {
	    /* we come here if the field is from a node
	     * where the records are not mem and maxmem
	     * but mem.used and mem.total
	     */
	    if (used.used !== undefined &&
		used.total !== undefined) {
		return used.used/used.total;
	    }
	}

	return used/max;
    },

    updateField: function(field) {
	var me = this;
	var text = '';
	var renderer = me.fieldRenderer;
	if (Ext.isFunction(field.renderer)) {
	    renderer = field.renderer;
	}
	if (field.textField !== undefined) {
	    field.updateValue(renderer(me.getRecordValue(field.textField)));
	} else if(field.valueField !== undefined) {
	    var used = me.getRecordValue(field.valueField);
	    /*jslint confusion: true*/
	    /* string and int */
	    var max = field.maxField !== undefined ? me.getRecordValue(field.maxField) : 1;

	    var calculate = me.fieldCalculator;

	    if (Ext.isFunction(field.calculate)) {
		calculate = field.calculate;
	    }
	    field.updateValue(renderer(used,max), calculate(used,max));
	}
    },

    getStore: function() {
	var me = this;
	if (!me.rstore) {
	    throw "there is no rstore";
	}

	return me.rstore;
    },

    updateTitle: function() {
	var me = this;
	me.setTitle(me.getRecordValue('name'));
    },

    updateValues: function(store, records, success) {
	if (!success) {
	    return; // do not update if store load was not successful
	}
	var me = this;
	var itemsToUpdate = me.query('pveInfoWidget');

	itemsToUpdate.forEach(me.updateField, me);

	me.updateTitle(store);
    },

    initComponent: function() {
	var me = this;

	if (!me.rstore) {
	    throw "no rstore given";
	}

	if (!me.title) {
	    throw "no title given";
	}

	PVE.Utils.monStoreErrors(me, me.rstore);

	me.callParent();

	me.mon(me.rstore, 'load', 'updateValues');
    }

});
