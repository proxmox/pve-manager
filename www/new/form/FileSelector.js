Ext.define('PVE.form.FileSelector', {
    extend: 'PVE.form.ComboGrid',
    requires: [
	'Ext.data.Store', 
	'PVE.RestProxy'
    ],
    alias: ['widget.PVE.form.FileSelector'],

    setStorage: function(storage, nodename) {
	var me = this;

	var change = false;
	if (storage && (me.storage !== storage)) {
	    me.storage = storage;
	    change = true;
	}

	if (nodename && (me.nodename !== nodename)) {
	    me.nodename = nodename;
	    change = true;
	}

	if (!(me.storage && me.nodename && change))
	    return;
	
	var url = '/api2/json/nodes/' + me.nodename + '/storage/' + me.storage;
	if (me.storageContent)
	    url += '?content=' + me.storageContent;

	me.store.setProxy({
	    type: 'pve',
	    url: url
	});

	me.store.load();
    },

    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.Store', {
	    fields: [ 'volid', 'format', 'size', 'used', 'vmid',
		      {	name: 'text', 
			convert: function(value, record) {
			    if (value)
				return value;
			    return record.data.volid.replace(/^.*:.*\//,'');;
			}
		      }],
	});

	Ext.apply(me, {
	    store: store,
	    allowBlank: false,
	    autoSelect: false,
	    valueField: 'volid',
	    displayField: 'text',
            listConfig: {
		columns: [
		    {
			header: 'Name',
			dataIndex: 'text',
			hideable: false,
			flex: 1
		    },
		    {
			header: 'Format',  
			width: 60, 
			dataIndex: 'format'
		    },
		    {
			header: 'Size',  
			width: 60, 
			dataIndex: 'size', 
			renderer: PVE.Utils.format_size 
		    }
		]
	    }
 	});

        me.callParent();

	me.setStorage(me.storage, me.nodename);
    }
});