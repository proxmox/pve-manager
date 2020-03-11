Ext.define('PVE.sdn.VnetView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveSDNVnetView'],

    stateful: true,
    stateId: 'grid-sdn-vnet',

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-sdn-vnet',
	    proxy: {
                type: 'proxmox',
		url: "/api2/json/cluster/sdn/vnets"
	    },
	    sorters: {
		property: 'vnet',
		order: 'DESC'
	    }
	});

	var reload = function() {
	    store.load();
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

        var run_editor = function() {
            var rec = sm.getSelection()[0];

            var win = Ext.create('PVE.sdn.VnetEdit',{
                vnet: rec.data.vnet
            });
            win.on('destroy', reload);
            win.show();
        };

	var edit_btn = new Proxmox.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor
	});

	var remove_btn = Ext.create('Proxmox.button.StdRemoveButton', {
	    selModel: sm,
	    baseurl: '/cluster/sdn/vnets/',
	    callback: reload
	});

	Ext.apply(me, {
	    store: store,
	    reloadStore: reload,
	    selModel: sm,
	    viewConfig: {
		trackOver: false
	    },
	    tbar: [
                {
                    text: gettext('Create'),
                    handler: function() {
                        var win = Ext.create('PVE.sdn.VnetEdit',{
			    type: 'vnet'
			});
                        win.on('destroy', reload);
                        win.show();
                    }
                },
		remove_btn,
		edit_btn,
                {
                    text: gettext('Revert'),
                    handler: function() {
                        Proxmox.Utils.API2Request({
                            url: '/cluster/sdn/vnets/',
                            method: 'DELETE',
                            waitMsgTarget: me,
                            callback: function() {
                                reload();
                            },
                            failure: function(response, opts) {
                                Ext.Msg.alert(gettext('Error'), response.htmlStatus);
                            }
                        });
                    }
                },

	    ],
	    columns: [
		{
		    header: 'ID',
		    flex: 2,
		    sortable: true,
		    dataIndex: 'vnet'
		},
		{
		    header: gettext('alias'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'alias',
		},
		{
		    header: gettext('zone'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'zone',
		},
		{
		    header: gettext('tag'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'tag',
		},
		{
		    header: gettext('ipv4'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'ipv4',
		},
		{
		    header: gettext('ipv6'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'ipv6',
		},
		{
		    header: gettext('mac'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'mac',
		},
		{
		    header: gettext('mtu'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'mtu',
		},
	    ],
	    listeners: {
		activate: reload,
		itemdblclick: run_editor
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-sdn-vnet', {
	extend: 'Ext.data.Model',
	fields: [
	    'type'
	],
	idProperty: 'vnet'
    });

});
