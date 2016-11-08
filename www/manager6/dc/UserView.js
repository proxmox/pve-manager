Ext.define('PVE.window.PasswordEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	if (!me.userid) {
	    throw "no userid specified";
	}

	var verifypw;
	var pwfield;

	var validate_pw = function() {
	    if (verifypw.getValue() !== pwfield.getValue()) {
		return gettext("Passwords does not match");
	    }
	    return true;
	};

	verifypw = Ext.createWidget('textfield', { 
	    inputType: 'password',
	    fieldLabel: gettext('Confirm password'), 
	    name: 'verifypassword',
	    submitValue: false,
	    validator: validate_pw
	});

	pwfield = Ext.createWidget('textfield', { 
	    inputType: 'password',
	    fieldLabel: gettext('Password'), 
	    minLength: 5,
	    name: 'password',
	    validator: validate_pw
	});

	Ext.apply(me, {
	    subject: gettext('Password'),
	    url: '/api2/extjs/access/password',
	    items: [
		pwfield, verifypw,
		{
		    xtype: 'hiddenfield',
		    name: 'userid',
		    value: me.userid
		}
	    ]
	});

	me.callParent();
    }
});

Ext.define('PVE.dc.UserView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveUserView'],

    onlineHelp: 'pveum_users',

    stateful: true,
    stateId: 'grid-users',

    initComponent : function() {
	var me = this;

	var caps = Ext.state.Manager.get('GuiCap');

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
		if (!caps.access['User.Modify']) {
		    return false;
		}
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
	    if (!rec || !caps.access['User.Modify']) {
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
	    enableFn: function(rec) {
		return !!caps.access['User.Modify'];
	    },
	    selModel: sm,
	    handler: run_editor
	});

	var pwchange_btn = new PVE.button.Button({
	    text: gettext('Password'),
	    disabled: true,
	    selModel: sm,
	    handler: function(btn, event, rec) {
		var win = Ext.create('PVE.window.PasswordEdit',{
                    userid: rec.data.userid
		});
		win.on('destroy', reload);
		win.show();
	    }
	});

        var tbar = [
            {
		text: gettext('Add'),
		disabled: !caps.access['User.Modify'],
		handler: function() {
                    var win = Ext.create('PVE.dc.UserEdit',{
                    });
                    win.on('destroy', reload);
                    win.show();
		}
            },
	    edit_btn, remove_btn, pwchange_btn
        ];

	var render_full_name = function(firstname, metaData, record) {

	    var first = firstname || '';
	    var last = record.data.lastname || '';
	    return first + " " + last;
	};

	var render_username = function(userid) {
	    return userid.match(/^(.+)(@[^@]+)$/)[1];
	};

	var render_realm = function(userid) {
	    return userid.match(/@([^@]+)$/)[1];
	};

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
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
		    renderer: PVE.Utils.format_boolean,
		    dataIndex: 'enable'
		},
		{
		    header: gettext('Expire'),
		    width: 80,
		    sortable: true,
		    renderer: PVE.Utils.format_expire, 
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
		    header: gettext('Comment'),
		    sortable: false,
		    renderer: Ext.String.htmlEncode,
		    dataIndex: 'comment',
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
