Ext.define('PVE.grid.PendingObjectGrid', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pvePendingObjectGrid'],

    getObjectValue: function(key, defaultValue, pending) {
	var me = this;
	var rec = me.store.getById(key);
	if (rec) {
	    if (pending && rec.data['pending']) {
		return rec.data['pending'];
	    }else if (rec.data.value) {
		return rec.data.value;
	    }else {
		return defaultValue;
	    }
	}
	return defaultValue;
    },

    renderKey: function(key, metaData, record, rowIndex, colIndex, store) {
	var me = this;
	var rows = me.rows;
	var rowdef = (rows && rows[key]) ?  rows[key] : {};
	return rowdef.header || key;
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
	    current = renderer(value, metaData, record, rowIndex, colIndex, store);
	    if(record.data['pending'] || rowdef.multiValues){
		pending = renderer(record.data['pending'], metaData, record, rowIndex, colIndex, store, 1);
	    }
	    if(pending == current) {
		pending = undefined;
	    }
	}else{
	    current = value;
	    pending = record.data['pending'];
	}
	if(record.data['delete']){
	    pendingdelete = '<div style="text-decoration: line-through;">'+ current +'</div>';
	}

	value = current;
	if(pending || pendingdelete){
	    value += '<div style="color:red">' + pending + pendingdelete + '</div>';
	}
	return value;
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

	var rstore = me.rstore;

	var store = Ext.create('PVE.data.DiffStore', { rstore: rstore });

	if (rows) {
	    Ext.Object.each(rows, function(key, rowdef) {
		//fixme : add missing options from config file ?
		if (Ext.isDefined(rowdef.defaultValue)) {
		    store.add({ key: key, value: rowdef.defaultValue, pending: undefined, delete: undefined });
		} else if (rowdef.required) {
		    store.add({ key: key, value: undefined, pending: undefined, delete: undefined });
		}
	    });
	}

	if (me.sorterFn) {
	    store.sorters.add(new Ext.util.Sorter({
		sorterFn: me.sorterFn
	    }));
	}

	store.filters.add(new Ext.util.Filter({
	    filterFn: function(item) {
		if (rows) {
		    var rowdef = rows[item.data.key];
		    if (!rowdef || (rowdef.visible === false)) {
			return false;
		    }
		}
		return true;
	    }
	}));

	PVE.Utils.monStoreErrors(me, rstore);


	Ext.applyIf(me, {
	    store: store,
	    hideHeaders: true,
	    stateful: false,
	    columns: [
		{
		    header: gettext('Name'),
		    width: me.cwidth1 || 100,
		    dataIndex: 'key',
		    renderer: me.renderKey
		},
		{
		    flex: 1,
		    header: gettext('Value'),
		    dataIndex: 'value',
		    renderer: me.renderValue
		}
	    ]
	});

	me.callParent();
   }
});
