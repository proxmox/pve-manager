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

        var tbar = [
            {
		text: 'Create',
		handler: function() {
                    var win = Ext.create('PVE.dc.AuthEdit',{
                    });
                    win.on('destroy', reload);
                    win.show();
		}
            },
            {
		text: 'Modify',
		handler: function() {
		    var sm = me.getSelectionModel();
		    var rec = sm.getSelection()[0];
		    if (!rec) {
			return;
		    }

		    var realm = rec.data.realm;

                    var win = Ext.create('PVE.dc.AuthEdit',{
                        realm: realm
                    });
                    win.on('destroy', reload);
                    win.show();
		}
            },
            {
		text: 'Delete',
		handler: function() {
		    var msg;
		    var sm = me.getSelectionModel();
		    var rec = sm.getSelection()[0];
		    if (!rec) {
			return;
		    }

		    var realm = rec.data.realm;

		    if (realm !== 'pam' && realm != 'pve') {
			msg = 'Are you sure you want to permanently the authentication realm: ' + realm;
			Ext.Msg.confirm('Deletion Confirmation', msg, function(btn) {
			    if (btn !== 'yes') {
				return;
			    }

			    PVE.Utils.API2Request({
				url: '/access/domains/' + realm,
				method: 'DELETE',
				waitMsgTarget: me,
				callback: function() {
				    reload();
				},
				failure: function (response, opts) {
				    Ext.Msg.alert('Error',response.htmlStatus);
				}
			    });
			});
		    } else {
			msg = 'You are not permitted to delete the auth method: pam';
			Ext.Msg.alert('Error', msg);
		    }
		}
            }
        ];

	Ext.apply(me, {
	    store: store,
	    stateful: false,
            tbar: tbar,
	    viewConfig: {
		trackOver: false
	    },
	    columns: [
		{
		    header: 'Realm',
		    width: 100,
		    sortable: true,
		    dataIndex: 'realm'
		},
		{
		    header: 'Type',
		    width: 100,
		    sortable: true,
		    dataIndex: 'type'
		},
		{
		    id: 'comment',
		    header: 'Comment',
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
