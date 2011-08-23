Ext.define('PVE.dc.GroupView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveGroupView'],

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-groups',
	    proxy: {
                type: 'pve',
		url: "/api2/json/access/groups"
	    },
	    sorters: { 
		property: 'groupid', 
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
		    var win = Ext.create('PVE.dc.GroupEdit', {
		    });
		    win.on('destroy', reload);
		    win.show();
		}
            },
            {
		text: 'Delete',
		handler: function() {
		    var sm = me.getSelectionModel();
		    var rec = sm.getSelection()[0];
		    if (!rec) {
			return;
		    }
		    var groupid = rec.data.groupid;

		    var msg = 'Are you sure you want to permanently delete the group: ' + groupid;
		    Ext.Msg.confirm('Deletion Confirmation', msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			PVE.Utils.API2Request({
			    url: '/access/groups/' + groupid,
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
		    header: 'Group name',
		    width: 200,
		    sortable: true,
		    dataIndex: 'groupid'
		},
		{
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
}, function() {

    Ext.define('pve-groups', {
	extend: 'Ext.data.Model',
	fields: [ 'groupid', 'comment' ],
	idProperty: 'groupid'
    });

});
