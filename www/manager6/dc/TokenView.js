/*jslint confusion: true */
Ext.define('PVE.dc.TokenView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveTokenView'],

    onlineHelp: 'chapter_user_management',

    stateful: true,
    stateId: 'grid-tokens',

    // use fixed user
    userid: undefined,

    initComponent : function() {
	var me = this;

	var caps = Ext.state.Manager.get('GuiCap');

	var store = new Ext.data.Store({
            id: "tokens",
	    model: 'pve-tokens',
	    sorters: [
		{
		    property: 'userid',
		    order: 'ASC'
		},
		{
		    property: 'tokenid',
		    order: 'ASC',
		}
	    ]
	});

	var reload = function() {
	    Proxmox.Utils.API2Request({
		url: '/access/users/?full=1',
		method: 'GET',
		failure: function(response, opts) {
		    Proxmox.Utils.setErrorMask(me, response.htmlStatus);
		    me.load_task.delay(me.load_delay);
		},
		success: function(response, opts) {
		    Proxmox.Utils.setErrorMask(me, false);
		    var result = Ext.decode(response.responseText);
		    var data = result.data || [];
		    var records = [];
		    Ext.Array.each(data, function(user) {
			tokens = user.tokens || [];
			Ext.Array.each(tokens, function(token) {
			    var r = {};
			    r.id = user.userid + '!' + token.tokenid;
			    r.userid = user.userid;
			    r.tokenid = token.tokenid;
			    r.comment = token.comment;
			    r.expire = token.expire;
			    r.privsep = token.privsep === 1 ? true : false;
			    records.push(r);
			});
		    });
		    store.loadData(records);
		},
	    });
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	var remove_btn = Ext.create('Proxmox.button.StdRemoveButton', {
	    selModel: sm,
	    enableFn: function(rec) {
		return !!caps.access['User.Modify'];
	    },
	    callback: function() {
		reload();
	    },
	    getUrl: function(rec) {
		return '/access/users/' + encodeURIComponent(rec.data.userid) + '/token/' + encodeURIComponent(rec.data.tokenid);
	    }
        });
 
	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec || !caps.access['User.Modify']) {
		return;
	    }

            var win = Ext.create('PVE.dc.TokenEdit', {
		userid: rec.data.userid,
		tokenid: rec.data.tokenid
            });
            win.on('destroy', reload);
            win.show();
	};

	var edit_btn = new Proxmox.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    enableFn: function(rec) {
		return !!caps.access['User.Modify'];
	    },
	    selModel: sm,
	    handler: run_editor
	});

	var perm_btn = new Proxmox.button.Button({
	    text: gettext('Permissions'),
	    disabled: false,
	    selModel: sm,
	    handler: function(btn, event, rec) {
		var rec = sm.getSelection()[0];
		var win = Ext.create('PVE.dc.PermissionView', {
		    userid: rec.data.id
		});
		win.show();
	    }
	});

        var tbar = [
            {
		text: gettext('Add'),
		disabled: !caps.access['User.Modify'],
		handler: function() {
		    var rec = sm.getSelection()[0];
		    var data = {};
		    if (rec && rec.data) {
			data.userid = rec.data.userid;
		    }
		    var win = Ext.create('PVE.dc.TokenEdit', data);
		    win.on('destroy', reload);
		    win.show();
		}
            },
	    edit_btn, remove_btn, perm_btn
        ];

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
		    header: gettext('Token name'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'tokenid'
		},
		{
		    header: gettext('Expire'),
		    width: 80,
		    sortable: true,
		    renderer: Proxmox.Utils.format_expire,
		    dataIndex: 'expire'
		},
		{
		    header: gettext('Comment'),
		    sortable: false,
		    renderer: Ext.String.htmlEncode,
		    dataIndex: 'comment',
		    flex: 1
		},
		{
		    header: gettext('Privilege Separation'),
		    width: 80,
		    sortable: true,
		    renderer: Proxmox.Utils.format_boolean,
		    dataIndex: 'privsep'
		},
	    ],
	    listeners: {
		activate: reload,
		itemdblclick: run_editor
	    }
	});

	me.callParent();
    }
});
