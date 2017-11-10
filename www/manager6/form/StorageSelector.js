Ext.define('PVE.form.StorageSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: 'widget.pveStorageSelector',

    allowBlank: false,
    valueField: 'storage',
    displayField: 'storage',
    listConfig: {
	columns: [
	    {
		header: gettext('Name'),
		dataIndex: 'storage',
		hideable: false,
		flex: 1
	    },
	    {
		header: gettext('Type'),
		width: 60,
		dataIndex: 'type'
	    },
	    {
		header: gettext('Avail'),
		width: 80,
		dataIndex: 'avail',
		renderer: PVE.Utils.format_size
	    },
	    {
		header: gettext('Capacity'),
		width: 80,
		dataIndex: 'total',
		renderer: PVE.Utils.format_size
	    }
	]
    },

    reloadStorageList: function() {
	var me = this;
	if (!me.nodename) {
	    return;
	}

	var params = {
	    format: 1
	};
	var url = '/api2/json/nodes/' + me.nodename + '/storage';
	if (me.storageContent) {
	    params.content = me.storageContent;
	}
	if (me.targetNode) {
	    params.target = me.targetNode;
	    params.enabled = 1; // skip disabled storages
	}
	me.store.setProxy({
	    type: 'pve',
	    url: url,
	    extraParams: params
	});

	me.store.load();
 
    },

    setTargetNode: function(targetNode) {
	var me = this;

	if (!targetNode || (me.targetNode === targetNode)) {
	    return;
	}

	me.targetNode = targetNode;

	me.reloadStorageList();
    },

    setNodename: function(nodename) {
	var me = this;

	if (!nodename || (me.nodename === nodename)) {
	    return;
	}

	me.nodename = nodename;

	me.reloadStorageList();
    },

    initComponent: function() {
	var me = this;

	var nodename = me.nodename;
	me.nodename = undefined; 

	var store = Ext.create('Ext.data.Store', {
	    model: 'pve-storage-status',
	    sorters: {
		property: 'storage', 
		order: 'DESC' 
	    }
	});

	Ext.apply(me, {
	    store: store
	});

        me.callParent();

	if (nodename) {
	    me.setNodename(nodename);
	}
    }
}, function() {

    Ext.define('pve-storage-status', {
	extend: 'Ext.data.Model',
	fields: [ 'storage', 'active', 'type', 'avail', 'total' ],
	idProperty: 'storage'
    });

});
