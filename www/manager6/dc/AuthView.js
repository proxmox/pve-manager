Ext.define('PVE.dc.AuthView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveAuthView'],

    onlineHelp: 'pveum_authentication_realms',

    stateful: true,
    stateId: 'grid-authrealms',

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-domains',
	    sorters: { 
		property: 'realm', 
		order: 'DESC' 
	    }
	});

	var reload = function() {
	    store.load();
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

            var win = Ext.create('PVE.dc.AuthEdit',{
                realm: rec.data.realm,
		authType: rec.data.type
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
	    baseurl: '/access/domains/',
	    selModel: sm,
	    enableFn: function(rec) {
		return !(rec.data.type === 'pve' || rec.data.type === 'pam');
	    },
	    callback: function() {
		reload();
	    }
        });

        var tbar = [
	    {
		text: gettext('Add'),
		menu: new Ext.menu.Menu({
		    items: [
			{
			    text: gettext('Active Directory Server'),
			    handler: function() {
				var win = Ext.create('PVE.dc.AuthEdit', {
				    authType: 'ad'
				});
				win.on('destroy', reload);
				win.show();
			    }
			},
			{
			    text: gettext('LDAP Server'),
			    handler: function() {
				var win = Ext.create('PVE.dc.AuthEdit',{
				    authType: 'ldap'
				});
				win.on('destroy', reload);
				win.show();
			    }
			}
		    ]
		})
	    },
	    edit_btn, remove_btn
        ];

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
            tbar: tbar,
	    viewConfig: {
		trackOver: false
	    },
	    columns: [
		{
		    header: gettext('Realm'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'realm'
		},
		{
		    header: gettext('Type'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'type'
		},
		{
		    header: gettext('TFA'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'tfa'
		},
		{
		    header: gettext('Comment'),
		    sortable: false,
		    dataIndex: 'comment',
		    renderer: Ext.String.htmlEncode,
		    flex: 1
		}
	    ],
	    listeners: {
		activate: reload,
		itemdblclick: run_editor
	    }
	});

	me.callParent();
    }
});
