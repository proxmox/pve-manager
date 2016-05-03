Ext.define('PVE.grid.PendingObjectGrid', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pvePendingObjectGrid'],

    getObjectValue: function(key, defaultValue, pending) {
	var me = this;
	var rec = me.store.getById(key);
	if (rec) {
	    var value = (pending && Ext.isDefined(rec.data.pending) && (rec.data.pending !== '')) ? 
		rec.data.pending : rec.data.value;

            if (Ext.isDefined(value) && (value !== '')) {
		return value;
            } else {
		return defaultValue;
            }
	}
	return defaultValue;
    },

    hasPendingChanges: function(key) {
	var me = this;
	var rows = me.rows;
	var rowdef = (rows && rows[key]) ?  rows[key] : {};
	var keys = rowdef.multiKey ||  [ key ];
	var pending = false;

	Ext.Array.each(keys, function(k) {
	    var rec = me.store.getById(k);
	    if (rec && rec.data && Ext.isDefined(rec.data.pending) && (rec.data.pending !== '')) {
		pending = true;
		return false; // break
	    }
	});

	return pending;
    },

    renderValue: function(value, metaData, record, rowIndex, colIndex, store) {
	var me = this;
	var rows = me.rows;
	var key = record.data.key;
	var rowdef = (rows && rows[key]) ?  rows[key] : {};
	var renderer = rowdef.renderer;
	var current = '';
	var pendingdelete = '';
	var pending = '';

	if (renderer) {
	    current = renderer(value, metaData, record, rowIndex, colIndex, store, false);
	    if (me.hasPendingChanges(key)) {
		pending = renderer(record.data.pending, metaData, record, rowIndex, colIndex, store, true);
	    }
	    if (pending == current) {
		pending = undefined;
	    }
	} else {
	    current = value || '';
	    pending = record.data.pending;
	}

	if (record.data['delete']) {
	    pendingdelete = '<div style="text-decoration: line-through;">'+ current +'</div>';
	}

	if (pending || pendingdelete) {
	    return current + '<div style="color:red">' + (pending || '') + pendingdelete + '</div>';
	} else {
	    return current;
	}
    },

    initComponent : function() {
	var me = this;

	var rows = me.rows;

	if (!me.rstore) {
	    if (!me.url) {
		throw "no url specified";
	    }

	    me.rstore = Ext.create('PVE.data.ObjectStore', {
		model: 'KeyValuePendingDelete',
		readArray: true,
		url: me.url,
		interval: me.interval,
		extraParams: me.extraParams,
		rows: me.rows
	    });
	}

	me.callParent();
   }
});
