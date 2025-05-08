from pymongo import MongoClient

def get_mongo_client(uri):
    return MongoClient(uri)

def close_mongo_client(client):
    if client:
        client.close()
