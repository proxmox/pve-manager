Ext.define('PVE.dc.UserView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveUserView'],

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
            id: "users",
	    model: 'pve-users',
	    proxy: {
                type: 'pve',
		url: "/api2/json/access/users"
	    },
	    sorters: { 
		property: 'userid', 
		order: 'DESC' 
	    }
	});

	var reload = function() {
	    store.load();
	};

	var remove_btn = new Ext.Button({
	    text: 'Delete',
	    disabled: true,
	    handler: function() {
		var msg;
		var sm = me.getSelectionModel();
		var rec = sm.getSelection()[0];
		if (!rec) {
		    return;
		}

		var userid = rec.data.userid;

		msg = 'Are you sure you want to permanently delete the user: ' + userid;
		Ext.Msg.confirm('Deletion Confirmation', msg, function(btn) {
		    if (btn !== 'yes') {
			return;
		    }

		    PVE.Utils.API2Request({
			url: '/access/users/' + userid,
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
        });
 
	var run_editor = function() {
	    var sm = me.getSelectionModel();
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

	var edit_btn = new Ext.Button({
	    text: 'Modify',
	    disabled: true,
	    handler: run_editor
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		remove_btn.disable();
		edit_btn.disable();
		return;
	    }

	    edit_btn.setDisabled(false);

	    remove_btn.setDisabled(rec.data.userid === 'root@pam');
	};

        var tbar = [
            {
		text: 'Create',
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
	    stateful: false,
	    tbar: tbar,

	    viewConfig: {
		trackOver: false
	    },

	    columns: [
		{
		    header: 'User name',
		    width: 200,
		    sortable: true,
		    renderer: render_username,
		    dataIndex: 'userid'
		},
		{
		    header: 'Realm',
		    width: 100,
		    sortable: true,
		    renderer: render_realm,
		    dataIndex: 'userid'
		},
		{
		    header: 'Enabled',
		    width: 80,
		    sortable: true,
		    dataIndex: 'enable'
		},
		{
		    header: 'Expire',
		    width: 80,
		    sortable: true,
		    renderer: render_expire, 
		    dataIndex: 'expire'
		},
		{
		    header: 'Name',
		    width: 150,
		    sortable: true,
		    renderer: render_full_name,
		    dataIndex: 'firstname'
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
		show: reload,
		itemdblclick: run_editor,
		selectionchange: set_button_status
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-users', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'userid', 'firstname', 'lastname' , 'email', 'comment',
	    { type: 'boolean', name: 'enable' }, 
	    { type: 'date', dateFormat: 'timestamp', name: 'expire' }
	],
	idProperty: 'userid'
    });

});
