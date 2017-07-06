Ext.define('PVE.window.Settings', {
    extend: 'Ext.window.Window',

    width: '400px',
    title: gettext('My Settings'),
    iconCls: 'fa fa-gear',
    modal: true,
    bodyPadding: 10,
    resizable: false,

    buttons: [{
	text: gettext('Close'),
	handler: function() {
	    this.up('window').close();
	}
    }],

    layout: {
	type: 'vbox',
	align: 'center'
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	control: {
	    '#': {
		show: function() {
		    var me = this;
		    var sp = Ext.state.Manager.getProvider();

		    var username = sp.get('login-username') || PVE.Utils.noneText;
		    me.lookupReference('savedUserName').setValue(username);
		}
	    },
	    'button[name=reset]': {
		click: function () {
		    var blacklist = ['GuiCap', 'login-username', 'dash-storages'];
		    var sp = Ext.state.Manager.getProvider();
		    var state;
		    for (state in sp.state) {
			if (sp.state.hasOwnProperty(state)) {
			    if (blacklist.indexOf(state) !== -1) {
				continue;
			    }

			    sp.clear(state);
			}
		    }

		    window.location.reload();
		}
	    },
	    'button[name=clear-username]': {
		click: function () {
		    var me = this;
		    var usernamefield = me.lookupReference('savedUserName');
		    var sp = Ext.state.Manager.getProvider();

		    usernamefield.setValue(PVE.Utils.noneText);
		    sp.clear('login-username');
		}
	    },
	    'grid[reference=dashboard-storages]': {
		selectionchange: function(grid, selected) {
		    var me = this;
		    var sp = Ext.state.Manager.getProvider();

		    // saves the selected storageids as
		    // "id1,id2,id3,..."
		    // or clears the variable
		    if (selected.length > 0) {
			sp.set('dash-storages',
			    Ext.Array.pluck(selected, 'id').join(','));
		    } else {
			sp.clear('dash-storages');
		    }
		},
		afterrender: function(grid) {
		    var me = grid;
		    var sp = Ext.state.Manager.getProvider();
		    var store = me.getStore();
		    var items = [];
		    me.suspendEvent('selectionchange');
		    var storages = sp.get('dash-storages') || '';
		    storages.split(',').forEach(function(storage){
			// we have to get the records
			// to be able to select them
			if (storage !== '') {
			    var item = store.getById(storage);
			    if (item) {
				items.push(item);
			    }
			}
		    });
		    me.getSelectionModel().select(items);
		    me.resumeEvent('selectionchange');
		}
	    }
	}
    },

    items: [{
	    xtype: 'fieldset',
	    width: '90%',
	    title: gettext('Browser Settings'),
	    layout: {
		type: 'vbox',
		align: 'left'
	    },
	    defaults: {
		width: '100%',
		margin: '0 0 10 0'
	    },
	    items: [
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Dashboard Storages'),
		    labelAlign: 'left',
		    labelWidth: '50%'
		},
		{
		    xtype: 'grid',
		    maxHeight: 150,
		    reference: 'dashboard-storages',
		    selModel: {
			selType: 'checkboxmodel'
		    },
		    columns: [{
			header: gettext('Name'),
			dataIndex: 'storage',
			flex: 1
		    },{
			header: gettext('Node'),
			dataIndex: 'node',
			flex: 1
		    }],
		    store: {
			type: 'diff',
			field: ['type', 'storage', 'id', 'node'],
			rstore: PVE.data.ResourceStore,
			filters: [{
			    property: 'type',
			    value: 'storage'
			}],
			sorters: [ 'node','storage']
		    }
		},
		{
		    xtype: 'box',
		    autoEl: { tag: 'hr'}
		},
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Saved User name'),
		    labelAlign: 'left',
		    labelWidth: '50%',
		    stateId: 'login-username',
		    reference: 'savedUserName',
		    value: ''
		},
		{
		    xtype: 'button',
		    cls: 'x-btn-default-toolbar-small pve-inline-button',
		    text: gettext('Clear User name'),
		    width: 'auto',
		    name: 'clear-username'
		},
		{
		    xtype: 'box',
		    autoEl: { tag: 'hr'}
		},
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Layout'),
		    labelAlign: 'left',
		    labelWidth: '50%'
		},
		{
		    xtype: 'button',
		    cls: 'x-btn-default-toolbar-small pve-inline-button',
		    text: gettext('Reset Layout'),
		    width: 'auto',
		    name: 'reset'
		}
	    ]
    }],

    onShow: function() {
	var me = this;
	me.callParent();

    }
});
