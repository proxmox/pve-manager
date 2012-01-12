Ext.define('PVE.dc.UserView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveUserView'],

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
            id: "users",
	    model: 'pve-users',
	    sorters: { 
		property: 'userid', 
		order: 'DESC' 
	    }
	});

	var reload = function() {
	    store.load();
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	var remove_btn = new PVE.button.Button({
	    text: gettext('Remove'),
	    disabled: true,
	    selModel: sm,
	    enableFn: function(rec) {
		return rec.data.userid !== 'root@pam';
	    },
	    confirmMsg: function (rec) {
		return Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
					 "'" + rec.data.userid + "'");
	    },
	    handler: function(btn, event, rec) {
		var userid = rec.data.userid;

		PVE.Utils.API2Request({
		    url: '/access/users/' + userid,
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
        });
 
	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

            var win = Ext.create('PVE.dc.UserEdit',{
                userid: rec.data.userid
            });
            win.on('destroy', reload);
            win.show();
	};

	var edit_btn = new PVE.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor
	});

        var tbar = [
            {
		text: gettext('Create'),
		handler: function() {
                    var win = Ext.create('PVE.dc.UserEdit',{
                    });
                    win.on('destroy', reload);
                    win.show();
		}
            },
	    edit_btn, remove_btn
        ];
	   
	var render_expire = function(date) {
	    if (!date) {
		return 'never';
	    }
	    return Ext.Date.format(date, "Y-m-d");
	};

	var render_full_name = function(firstname, metaData, record) {

	    var first = firstname || '';
	    var last = record.data.lastname || '';
	    return first + " " + last;
	};

	var render_username = function(userid) {
	    return userid.match(/^([^@]+)/)[1];
	};

	var render_realm = function(userid) {
	    return userid.match(/@([^@]+)$/)[1];
	};

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    tbar: tbar,
	    viewConfig: {
		trackOver: false
	    },
	    columns: [
		{
		    header: gettext('User name'),
		    width: 200,
		    sortable: true,
		    renderer: render_username,
		    dataIndex: 'userid'
		},
		{
		    header: gettext('Realm'),
		    width: 100,
		    sortable: true,
		    renderer: render_realm,
		    dataIndex: 'userid'
		},
		{
		    header: gettext('Enabled'),
		    width: 80,
		    sortable: true,
		    dataIndex: 'enable'
		},
		{
		    header: gettext('Expire'),
		    width: 80,
		    sortable: true,
		    renderer: render_expire, 
		    dataIndex: 'expire'
		},
		{
		    header: gettext('Name'),
		    width: 150,
		    sortable: true,
		    renderer: render_full_name,
		    dataIndex: 'firstname'
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
		show: reload,
		itemdblclick: run_editor
	    }
	});

	me.callParent();
    }
});
