Ext.define('PVE.dc.AuthView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveAuthView'],

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

        var tbar = [
            {
		text: gettext('Create'),
		handler: function() {
                    var win = Ext.create('PVE.dc.AuthEdit',{
                    });
                    win.on('destroy', reload);
                    win.show();
		}
            },
            {
		xtype: 'pveButton',
		text: gettext('Edit'),
		selModel: sm,
		handler: function(btn, event, rec) {
		    var realm = rec.data.realm;

                    var win = Ext.create('PVE.dc.AuthEdit',{
                        realm: realm
                    });
                    win.on('destroy', reload);
                    win.show();
		}
            },
            {
		xtype: 'pveButton',
		text: gettext('Remove'),
		selModel: sm,
		confirmMsg: function (rec) {
		    return Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
					     "'" + rec.data.realm + "'");
		},
		enableFn: function(rec) {
		    var realm = rec.data.realm;
		    return realm !== 'pam' && realm != 'pve';
		},
		handler: function(btn, event, rec) {
		    var realm = rec.data.realm;

		    PVE.Utils.API2Request({
			url: '/access/domains/' + realm,
			method: 'DELETE',
			waitMsgTarget: me,
			callback: function() {
			    reload();
			},
			failure: function (response, opts) {
			    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			}
		    });
		}
            }
        ];

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
            //tbar: tbar,
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
		    id: 'comment',
		    header: gettext('Comment'),
		    sortable: false,
		    dataIndex: 'comment',
		    flex: 1
		}
	    ],
	    listeners: {
		show: function() {
		    store.load();
		}
	    }
	});

	me.callParent();
    }
});
